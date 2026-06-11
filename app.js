/* ============================================================
   Cockpit Fund Controlling — Moteur de calcul + UI
   Tout KPI affiché est dérivé du data model (data.js).
   Le moteur (section 1) est pur et testable hors navigateur.
   ============================================================ */
"use strict";

/* Contexte node (audit) : charger le data model dans le scope global. */
if (typeof module !== "undefined" && typeof document === "undefined") {
  Object.assign(globalThis, require("./data.js"));
}

/* ============================================================
   1. MOTEUR (pur, sans DOM)
   ============================================================ */

function netExposure(a) {
  return a.debt * a.floatShare * (1 - a.hedgeRatio);
}

/* s = { rent, vac, cap, rate } en décimal (ex. Bear : -0.10, 0.04, 0.0125, 0.015) */
function computeAsset(a, s) {
  const noiS = a.noi * (1 + s.rent) * (1 - s.vac);
  const valuationStressed = s.rent !== 0 || s.vac !== 0 || s.cap !== 0;
  /* À l'état de base la valeur affichée est l'input (expertise) ;
     NOI/cap n'est que le contrôle de cohérence. Sous stress, la
     valeur est entièrement dérivée : NOI stressé / cap stressé. */
  const value = valuationStressed ? noiS / (a.cap + s.cap) : a.value;
  const netExp = netExposure(a);
  const service = a.debt * a.allInRate + s.rate * netExp;
  return {
    ref: a,
    noiS,
    value,
    capEff: a.cap + s.cap,
    netExp,
    service,
    ltv: a.debt / value,
    bpVar: a.noi / a.bpNoi - 1,            // réalisé vs budget : toujours sur NOI de base
    reconDiff: a.value - a.noi / a.cap      // contrôle valeur stockée vs NOI/cap
  };
}

function computeState(s) {
  const rows = ASSETS.map(a => computeAsset(a, s));
  const sum = f => rows.reduce((t, r) => t + f(r), 0);

  const gav = sum(r => r.value);
  const noi = sum(r => r.noiS);
  const debt = sum(r => r.ref.debt);
  const service = sum(r => r.service);
  const netExp = sum(r => r.netExp);
  const capex = sum(r => r.ref.capexReserve);
  const bpNoiTotal = sum(r => r.ref.bpNoi);
  const noiBase = sum(r => r.ref.noi);

  const ltv = debt / gav;
  const nav = gav - debt + FUND.cash - FUND.otherLiabilities;
  const dscr = noi / service;
  const cf = noi - capex;
  const dscrCapex = cf / service;

  const emprise = rows.reduce(
    (m, r) => (r.value / gav > m.weight ? { id: r.ref.id, weight: r.value / gav } : m),
    { id: null, weight: 0 }
  );
  const aifm = gav / nav;

  return {
    sliders: { ...s },
    rows,
    gav, noi, debt, service, netExp, capex,
    blended: noi / gav,
    ltv, nav, dscr, cf, dscrCapex,
    vl: nav * 1e6 / FUND.shares,
    netLtv: (debt - FUND.cash) / gav,
    emprise, empriseStatus: empriseStatus(emprise.weight),
    aifm, aifmStatus: aifmStatus(aifm),
    bpVarTotal: noiBase / bpNoiTotal - 1,
    ltvStatus: ltvStatus(ltv),
    dscrStatus: dscrStatus(dscr),
    get globalStatus() {
      const rank = { green: 0, amber: 1, red: 2 };
      return rank[this.ltvStatus] >= rank[this.dscrStatus] ? this.ltvStatus : this.dscrStatus;
    }
  };
}

function ltvStatus(x) {
  const c = FUND.covenants;
  if (x > c.ltvMax) return "red";
  if (x >= c.ltvAmberFrom) return "amber";
  return "green";
}

function dscrStatus(x) {
  const c = FUND.covenants;
  if (x < c.dscrMin) return "red";
  if (x <= c.dscrAmberTo) return "amber";
  return "green";
}

function empriseStatus(x) {
  const r = FUND.ratios;
  if (x > r.empriseMax) return "red";
  if (x >= r.empriseAmberFrom) return "amber";
  return "green";
}

function aifmStatus(x) {
  const r = FUND.ratios;
  if (x > r.aifmMax) return "red";
  if (x >= r.aifmAmberFrom) return "amber";
  return "green";
}

function monthLabelFR(startYear, startMonthIndex, i) {
  const d = new Date(startYear, startMonthIndex + i, 1);
  return d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "") + " " +
         String(d.getFullYear()).slice(2);
}

/* Prévisionnel de trésorerie 12 mois, couplé au scénario courant :
   encaissements = NOI stressé / 12, service = service stressé / 4 (trimestriel),
   distributions semestrielles suspendues si breach covenant (cash trap). */
function computeTreasury(st) {
  const T = TREASURY;
  const suspended = st.globalStatus === "red";
  const monthlyIn = st.noi / 12;
  const serviceQ = st.service / 4;
  let bal = T.openingCash;
  let distTotal = 0, minBal = Infinity, minIdx = 0;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const capex = T.capexQuarterly[Math.floor(i / 3)] / 3;
    const service = T.serviceMonths.includes(i) ? serviceQ : 0;
    const dist = !suspended && T.distributionMonths.includes(i) ? T.distributionAmount : 0;
    distTotal += dist;
    bal += monthlyIn - T.feesMonthly - capex - service - dist;
    months.push({ idx: i, inflow: monthlyIn, fees: T.feesMonthly, capex, service, dist, closing: bal });
    if (bal < minBal) { minBal = bal; minIdx = i; }
  }
  return {
    months, suspended, distTotal, closing: bal, minBal, minIdx,
    suspendedAmount: suspended ? T.distributionMonths.length * T.distributionAmount : 0
  };
}

/* Atterrissage budgétaire 2026e (statique : réalisé vs budget). */
function computeLanding() {
  const rows = LANDING.map(l => {
    const asset = ASSETS.find(a => a.id === l.id);
    return { ...l, asset, bp: asset.bpNoi, gap: l.landing / asset.bpNoi - 1 };
  });
  const totals = {
    bp: rows.reduce((t, r) => t + r.bp, 0),
    q1: rows.reduce((t, r) => t + r.q1Actual, 0),
    landing: rows.reduce((t, r) => t + r.landing, 0)
  };
  totals.gap = totals.landing / totals.bp - 1;
  return { rows, totals };
}

/* Z-scores sur la série complète (écart-type d'échantillon, n−1). */
function zScores(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const z = values.map(v => (v - mean) / sd);
  return { mean, sd, z };
}

const ZERO_STRESS = { rent: 0, vac: 0, cap: 0, rate: 0 };

function isZero(s) { return s.rent === 0 && s.vac === 0 && s.cap === 0 && s.rate === 0; }
function isBear(s) {
  const eps = 1e-9;
  return Math.abs(s.rent - BEAR.rent) < eps && Math.abs(s.vac - BEAR.vac) < eps &&
         Math.abs(s.cap - BEAR.cap) < eps && Math.abs(s.rate - BEAR.rate) < eps;
}

/* ============================================================
   2. FORMATAGE (locale française)
   ============================================================ */

const NBSP = " ";

function nf(x, d = 1) {
  return x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const fm    = (x, d = 1) => (x < 0 ? "−" : "") + "€" + nf(Math.abs(x), d) + "m";
const feur  = (x, d = 2) => (x < 0 ? "−" : "") + "€" + nf(Math.abs(x), d);
const fpct  = (x, d = 1) => nf(x * 100, d) + NBSP + "%";
const fx2   = x => nf(x, 2) + "x";
const fsig  = (x, f) => (x > 0 ? "+" : "") + f(x);
const fpts  = x => fsig(x * 100, v => nf(v, 1)) + NBSP + "pts";

/* ============================================================
   3. RECETTE AUTOMATIQUE (spec §9 — partie calculatoire)
   ============================================================ */

function runSelfTests() {
  const approx = (a, b, tol) => Math.abs(a - b) <= tol;
  const tests = [];
  const t = (id, label, pass, detail) => tests.push({ id, label, pass: !!pass, detail });

  // Réconciliation par actif : |valeur stockée − NOI/cap| < €0,2m
  const base = computeState(ZERO_STRESS);
  const maxDiff = Math.max(...base.rows.map(r => Math.abs(r.reconDiff)));
  t("REC", "Réconciliation valeur vs NOI/cap (6 actifs, < €0,2m)", maxDiff < 0.2, "écart max " + fm(maxDiff, 2));

  // R1 — état de base
  t("R1", "Base : GAV 317,4 · NAV 170,5 · LTV 46,9 % · DSCR 2,59x",
    approx(base.gav, 317.4, 0.05) && approx(base.nav, 170.5, 0.05) &&
    approx(base.ltv, 0.46944, 0.0005) && approx(base.dscr, 2.5887, 0.005) &&
    approx(base.noi, 17.18, 0.005) && approx(base.debt, 149.0, 0.001) &&
    approx(base.service, 6.6365, 0.005) && approx(base.dscrCapex, 2.2346, 0.005) &&
    approx(base.netExp, 36.95, 0.01),
    `GAV ${fm(base.gav)} · NAV ${fm(base.nav)} · LTV ${fpct(base.ltv)} · DSCR ${fx2(base.dscr)}`);

  // R3 / R4 — points de bascule du slider cap rate seul
  const s125 = computeState({ ...ZERO_STRESS, cap: 0.0125 });
  t("R3", "Cap +125 bps seul → LTV 58,2 % (ambre)",
    approx(s125.ltv, 0.5818, 0.001) && s125.ltvStatus === "amber", "LTV " + fpct(s125.ltv));
  const s150 = computeState({ ...ZERO_STRESS, cap: 0.0150 });
  t("R4", "Cap +150 bps seul → LTV 60,4 % (rouge)",
    approx(s150.ltv, 0.6041, 0.001) && s150.ltvStatus === "red", "LTV " + fpct(s150.ltv));

  // R5 — scénario Bear complet
  const bear = computeState(BEAR);
  t("R5", "Bear : NOI 14,84 · GAV 221,3 · LTV 67,3 % rouge · DSCR 2,06 / 1,74",
    approx(bear.noi, 14.8435, 0.01) && approx(bear.gav, 221.28, 0.05) &&
    approx(bear.ltv, 0.6734, 0.001) && bear.ltvStatus === "red" &&
    approx(bear.dscr, 2.0642, 0.005) && approx(bear.dscrCapex, 1.7375, 0.005) &&
    bear.dscrStatus === "green",
    `NOI ${fm(bear.noi, 2)} · GAV ${fm(bear.gav)} · LTV ${fpct(bear.ltv)} · DSCR ${fx2(bear.dscr)} / ${fx2(bear.dscrCapex)}`);

  // R7 — choc de taux seul : la valeur ne bouge pas, seul le service monte
  const s300 = computeState({ ...ZERO_STRESS, rate: 0.03 });
  t("R7", "Taux +300 bps seul : service 7,75 · DSCR 2,22 · LTV inchangée",
    approx(s300.service, 7.745, 0.005) && approx(s300.dscr, 2.218, 0.005) &&
    Math.abs(s300.ltv - base.ltv) < 1e-12 && Math.abs(s300.gav - base.gav) < 1e-12,
    `service ${fm(s300.service, 2)} · DSCR ${fx2(s300.dscr)}`);

  // R8 — anomalies de flux : exactement déc. 2024 (+2,9σ) et juil. 2025 (−3,8σ)
  const { z } = zScores(MONTHLY_FLOWS.values);
  const flagged = z.map((v, i) => [v, i]).filter(([v]) => Math.abs(v) > MONTHLY_FLOWS.zThreshold).map(([, i]) => i);
  t("R8", "Anomalies : exactement 2 mois flaggés (index 8 et 15)",
    flagged.length === 2 && flagged.includes(8) && flagged.includes(15) &&
    approx(z[8], 2.92, 0.05) && approx(z[15], -3.75, 0.06),
    `z[8] = ${nf(z[8], 2)}σ · z[15] = ${nf(z[15], 2)}σ`);

  // R10 — écart BP de A6
  const a6 = base.rows.find(r => r.ref.id === "A6");
  t("R10", "Écart NOI vs BP de A6 = −3,0 %",
    approx(a6.bpVar, -0.0303, 0.0005), fpct(a6.bpVar));

  // R11 — VL par part, ratio d'emprise, levier AIFM (état de base)
  t("R11", "Base : VL €100,00 · emprise max 29,6 % (A1) · levier 1,86x",
    approx(base.vl, 100.0, 0.01) && base.emprise.id === "A1" &&
    approx(base.emprise.weight, 0.29616, 0.0005) && approx(base.aifm, 1.8616, 0.005) &&
    base.empriseStatus === "green" && base.aifmStatus === "green",
    `VL €${nf(base.vl, 2)} · emprise ${fpct(base.emprise.weight)} · levier ${fx2(base.aifm)}`);

  // R12 — trésorerie 12 mois, état de base
  const trB = computeTreasury(base);
  t("R12", "Tréso base : distributions 7,0 · clôture 7,59 · point bas ≥ seuil 3,0",
    !trB.suspended && approx(trB.distTotal, 7.0, 1e-9) &&
    approx(trB.closing, 7.59, 0.05) && trB.minBal > TREASURY.cashMin,
    `clôture ${fm(trB.closing, 2)} · point bas ${fm(trB.minBal, 2)} (${monthLabelFR(TREASURY.startYear, TREASURY.startMonthIndex, trB.minIdx)})`);

  // R13 — trésorerie Bear : cash trap, distributions suspendues
  const trX = computeTreasury(bear);
  t("R13", "Tréso Bear : distributions suspendues (cash trap), clôture ≈ 11,7",
    trX.suspended && trX.distTotal === 0 && approx(trX.closing, 11.70, 0.05) &&
    approx(trX.suspendedAmount, 7.0, 1e-9),
    `clôture ${fm(trX.closing, 2)} · ${fm(trX.suspendedAmount, 1)} de distributions suspendues`);

  // R14 — atterrissage budgétaire 2026e
  const ld = computeLanding();
  t("R14", "Atterrissage 2026e : 17,21 vs BP 17,80 (−3,3 %)",
    approx(ld.totals.landing, 17.21, 0.001) && approx(ld.totals.bp, 17.80, 0.001) &&
    approx(ld.totals.gap, -0.0331, 0.0005),
    `atterrissage ${fm(ld.totals.landing, 2)} · BP ${fm(ld.totals.bp, 2)} · écart ${fpct(ld.totals.gap)}`);

  const passed = tests.filter(x => x.pass).length;
  return { tests, passed, total: tests.length, maxDiff };
}

/* Export pour l'audit node. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeState, computeAsset, zScores, ltvStatus, dscrStatus, computeTreasury, computeLanding, monthLabelFR, runSelfTests, ZERO_STRESS, isZero, isBear, nf, fm, fpct, fx2 };
}

/* ============================================================
   4. UI (navigateur uniquement)
   ============================================================ */
if (typeof document !== "undefined") (() => {

  const $ = sel => document.querySelector(sel);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----- état courant des sliders (valeurs d'affichage, pt/bps) ----- */
  const sliderEls = {};   // key -> input
  let baseState = null;   // état de référence (sliders à 0)
  let lastCommentKey = null;

  function currentStress() {
    const s = {};
    for (const cfg of SLIDERS) s[cfg.key] = cfg.toDecimal(Number(sliderEls[cfg.key].value));
    return s;
  }

  /* ----- tween numérique ----- */
  function setNum(el, target, fmtFn) {
    if (el._val === undefined || reducedMotion) {
      el._val = target;
      el.textContent = fmtFn(target);
      return;
    }
    const from = el._val;
    if (from === target) { el.textContent = fmtFn(target); return; }
    if (el._raf) cancelAnimationFrame(el._raf);
    const t0 = performance.now(), dur = 320;
    const ease = u => u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
    const step = now => {
      const u = Math.min(1, (now - t0) / dur);
      const v = from + (target - from) * ease(u);
      el._val = v;
      el.textContent = fmtFn(v);
      if (u < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  const STATUS_LABEL = { green: "Conforme", amber: "Zone d'alerte", red: "Breach" };

  function pill(status, label) {
    return `<span class="pill pill-${status}"><span class="dot"></span>${label ?? STATUS_LABEL[status]}</span>`;
  }

  /* ============================================================
     M1 — Bandeau KPI
     ============================================================ */
  const KPI_DEFS = [
    { id: "gav",  label: "GAV",            fmt: v => fm(v, 1), get: st => st.gav,
      sub: st => `Cap blended ${fpct(st.blended, 2)}`,
      delta: (st, b) => `${fsig(st.gav - b.gav, v => fm(v, 1))} (${fsig((st.gav / b.gav - 1) * 100, v => nf(v, 1))}${NBSP}%)` },
    { id: "nav",  label: "NAV",            fmt: v => fm(v, 1), get: st => st.nav,
      sub: st => `VL ${feur(st.vl)} / part · ${nf(FUND.shares, 0)} parts`,
      delta: (st, b) => `${fsig(st.nav - b.nav, v => fm(v, 1))} (${fsig((st.nav / b.nav - 1) * 100, v => nf(v, 1))}${NBSP}%)` },
    { id: "ltv",  label: "LTV consolidée", fmt: v => fpct(v, 1), get: st => st.ltv, status: st => st.ltvStatus,
      sub: () => `Covenant max ${fpct(FUND.covenants.ltvMax, 0)} · alerte dès ${fpct(FUND.covenants.ltvAmberFrom, 0)}`,
      delta: (st, b) => fpts(st.ltv - b.ltv) },
    { id: "dscr", label: "DSCR (covenant, IO)", fmt: fx2, get: st => st.dscr, status: st => st.dscrStatus,
      sub: st => `Min ${fx2(FUND.covenants.dscrMin)} · après capex/TI ${fx2(st.dscrCapex)}`,
      delta: (st, b) => fsig(st.dscr - b.dscr, v => nf(v, 2) + "x") },
    { id: "noi",  label: "NOI total",      fmt: v => fm(v, 2), get: st => st.noi,
      sub: st => `vs budget consolidé ${fpct(st.bpVarTotal, 1)}`,
      delta: (st, b) => `${fsig(st.noi - b.noi, v => fm(v, 2))} (${fsig((st.noi / b.noi - 1) * 100, v => nf(v, 1))}${NBSP}%)` },
    { id: "debt", label: "Dette totale",   fmt: v => fm(v, 1), get: st => st.debt,
      sub: st => `Service ${fm(st.service, 2)} · expo nette taux ${fm(st.netExp, 1)}`,
      delta: null }
  ];

  function buildKpis() {
    $("#kpi-grid").innerHTML = KPI_DEFS.map(k => `
      <article class="kpi" id="kpi-${k.id}">
        <header><span class="kpi-label">${k.label}</span><span class="kpi-pill"></span></header>
        <div class="kpi-value mono" id="kpiv-${k.id}">—</div>
        <div class="kpi-delta mono" id="kpid-${k.id}"></div>
        <div class="kpi-sub" id="kpis-${k.id}"></div>
      </article>`).join("");
  }

  function renderKpis(st) {
    const active = !isZero(st.sliders);
    for (const k of KPI_DEFS) {
      setNum($("#kpiv-" + k.id), k.get(st), k.fmt);
      $("#kpis-" + k.id).textContent = k.sub(st);
      const d = $("#kpid-" + k.id);
      if (k.delta && active) {
        d.textContent = k.delta(st, baseState) + " vs base";
        d.style.visibility = "visible";
      } else {
        d.textContent = "·";
        d.style.visibility = "hidden";
      }
      const pe = $("#kpi-" + k.id + " .kpi-pill");
      if (k.status) pe.innerHTML = pill(k.status(st));
    }
  }

  /* ============================================================
     M3 — Jauges covenants
     ============================================================ */
  const LTV_DOMAIN = [0.30, 0.75];
  const DSCR_DOMAIN = [1.0, 3.0];
  const posIn = (x, [a, b]) => Math.max(0, Math.min(100, (x - a) / (b - a) * 100)) + "%";

  function buildGauges() {
    const c = FUND.covenants;
    const g1 = posIn(c.ltvAmberFrom, LTV_DOMAIN), g2 = posIn(c.ltvMax, LTV_DOMAIN);
    $("#gauge-ltv .gauge-track").style.background =
      `linear-gradient(to right, var(--ok-soft) ${g1}, var(--amber-soft) ${g1} ${g2}, var(--red-soft) ${g2})`;
    $("#gauge-ltv .tick-amber").style.left = g1;
    $("#gauge-ltv .tick-red").style.left = g2;
    $("#gauge-ltv .tl-amber").style.left = g1;
    $("#gauge-ltv .tl-red").style.left = g2;

    const d1 = posIn(c.dscrMin, DSCR_DOMAIN), d2 = posIn(c.dscrAmberTo, DSCR_DOMAIN);
    $("#gauge-dscr .gauge-track").style.background =
      `linear-gradient(to right, var(--red-soft) ${d1}, var(--amber-soft) ${d1} ${d2}, var(--ok-soft) ${d2})`;
    $("#gauge-dscr .tick-red").style.left = d1;
    $("#gauge-dscr .tick-amber").style.left = d2;
    $("#gauge-dscr .tl-red").style.left = d1;
    $("#gauge-dscr .tl-amber").style.left = d2;
  }

  function renderGauges(st) {
    setNum($("#gauge-ltv .gauge-val"), st.ltv, v => fpct(v, 1));
    $("#gauge-ltv .gauge-pill").innerHTML = pill(st.ltvStatus);
    $("#gauge-ltv .gauge-marker").style.left = posIn(st.ltv, LTV_DOMAIN);
    $("#gauge-ltv .gauge-ghost").style.left = posIn(baseState.ltv, LTV_DOMAIN);

    setNum($("#gauge-dscr .gauge-val"), st.dscr, fx2);
    $("#gauge-dscr .gauge-pill").innerHTML = pill(st.dscrStatus);
    $("#gauge-dscr .gauge-marker").style.left = posIn(st.dscr, DSCR_DOMAIN);
    $("#gauge-dscr .gauge-ghost").style.left = posIn(baseState.dscr, DSCR_DOMAIN);

    renderRatios(st);

    const banner = $("#breach-banner");
    if (st.ltvStatus === "red" || st.dscrStatus === "red") {
      banner.className = "banner banner-red";
      banner.innerHTML = `<strong>COVENANT BREACH</strong> — LTV ${fpct(st.ltv)} &gt; ${fpct(FUND.covenants.ltvMax, 0)}.
        Constat à la prochaine date de test : période de remédiation, options de cure (apport d'equity,
        remboursement partiel, sûretés complémentaires) ; cash trap probable dans l'intervalle.`;
    } else if (st.ltvStatus === "amber" || st.dscrStatus === "amber") {
      banner.className = "banner banner-amber";
      banner.innerHTML = `<strong>Zone d'alerte</strong> — LTV ${fpct(st.ltv)} dans le buffer
        (${fpct(FUND.covenants.ltvAmberFrom, 0)}–${fpct(FUND.covenants.ltvMax, 0)}).
        Surveillance renforcée et dialogue prêteurs recommandés avant la prochaine date de test.`;
    } else {
      banner.className = "banner banner-ok";
      banner.innerHTML = `<strong>Covenants conformes</strong> — marge de ${fpts(FUND.covenants.ltvMax - st.ltv).replace("+", "")}
        sur la LTV et ${nf(st.dscr - FUND.covenants.dscrMin, 2)}x sur le DSCR.`;
    }
  }

  /* Ratios de structure (hors covenants bancaires) — strip sous les jauges. */
  function renderRatios(st) {
    const r = FUND.ratios;
    $("#ratio-strip").innerHTML = `
      <div class="ratio">
        <span class="ratio-label"><abbr title="Poids du premier actif dans la GAV — limite de concentration interne, suivi type SCPI/OPCI">Ratio d'emprise max</abbr></span>
        <span class="ratio-val mono">${fpct(st.emprise.weight, 1)}</span>
        <span class="ratio-sub">${st.emprise.id} · limite interne ${fpct(r.empriseMax, 0)}</span>
        ${pill(st.empriseStatus)}
      </div>
      <div class="ratio">
        <span class="ratio-label"><abbr title="Approche simplifiée et pédagogique : GAV ÷ NAV. La méthode réglementaire de l'engagement nette notamment les couvertures.">Levier AIFM (simplifié)</abbr></span>
        <span class="ratio-val mono">${fx2(st.aifm)}</span>
        <span class="ratio-sub">plafond prospectus ${fx2(r.aifmMax)}</span>
        ${pill(st.aifmStatus)}
      </div>
      <div class="ratio">
        <span class="ratio-label"><abbr title="(Dette totale − trésorerie) ÷ GAV — lecture fréquente dans les documentations bancaires">LTV nette de trésorerie</abbr></span>
        <span class="ratio-val mono">${fpct(st.netLtv, 1)}</span>
        <span class="ratio-sub">cash ${fm(FUND.cash)} en déduction</span>
        <span class="pill pill-info">info</span>
      </div>`;
  }

  /* ============================================================
     M4 — Moteur de stress
     ============================================================ */
  function buildSliders() {
    $("#sliders").innerHTML = SLIDERS.map(cfg => `
      <div class="slider" id="sl-${cfg.key}">
        <div class="slider-head">
          <label for="in-${cfg.key}">${cfg.label}</label>
          <output class="mono" id="out-${cfg.key}"></output>
        </div>
        <input type="range" id="in-${cfg.key}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}"
               value="${cfg.base}" aria-label="${cfg.label}, de ${cfg.min} à ${cfg.max} ${cfg.unit}">
        <div class="slider-insight mono" id="ins-${cfg.key}"></div>
        ${cfg.warning ? `<div class="slider-warning">⚠ ${cfg.warning}</div>` : ""}
      </div>`).join("");
    for (const cfg of SLIDERS) {
      sliderEls[cfg.key] = $("#in-" + cfg.key);
      sliderEls[cfg.key].addEventListener("input", render);
    }
  }

  function sliderOutput(cfg, v) {
    if (cfg.unit === "%") return (v > 0 ? "+" : "") + nf(v, 0) + NBSP + "%";
    return (v > 0 ? "+" : "") + nf(v, 0) + NBSP + "bps";
  }

  function renderSliders(st) {
    const b = baseState;
    for (const cfg of SLIDERS) {
      const v = Number(sliderEls[cfg.key].value);
      $("#out-" + cfg.key).textContent = sliderOutput(cfg, v);
      $("#sl-" + cfg.key).classList.toggle("active", v !== cfg.base);
    }
    $("#ins-rent").textContent =
      `NOI ${fm(st.noi, 2)} (${fsig((st.noi / b.noi - 1) * 100, x => nf(x, 1))}${NBSP}%) — l'assiette de valeur suit le NOI`;
    $("#ins-vac").textContent =
      `+100 bps ≈ −${fm(b.noi / 100, 2)} de NOI annuel · NOI courant ${fm(st.noi, 2)}`;
    $("#ins-cap").textContent =
      `GAV ${fm(st.gav, 1)} (${fsig(st.gav - b.gav, x => fm(x, 1))} vs base) · LTV ${fpct(st.ltv, 1)}`;
    $("#ins-rate").textContent =
      `Service ${fm(st.service, 2)} (${fsig(st.service - b.service, x => fm(x, 2))}) · DSCR ${fx2(st.dscr)} — seuls ${fm(st.netExp, 1)} sur ${fm(st.debt, 0)} sont exposés`;

    const name = isZero(st.sliders) ? "Situation de base"
               : isBear(st.sliders) ? "Scénario Bear (préréglé)"
               : "Stress personnalisé";
    $("#scenario-name").textContent = name;
    $("#sb-scenario").textContent = name;
    $("#btn-reset").classList.toggle("is-hidden", isZero(st.sliders));
  }

  /* Animation du préréglage Bear : glissement des 4 curseurs. */
  function applyScenario(target) {
    const goals = SLIDERS.map(cfg => {
      let raw;
      if (cfg.unit === "%") raw = target[cfg.key] * 100;
      else raw = target[cfg.key] * 10000;
      return { cfg, from: Number(sliderEls[cfg.key].value), to: raw };
    });
    if (reducedMotion) {
      goals.forEach(g => { sliderEls[g.cfg.key].value = g.to; });
      render();
      return;
    }
    const t0 = performance.now(), dur = 620;
    const ease = u => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const step = now => {
      const u = Math.min(1, (now - t0) / dur);
      goals.forEach(g => {
        const v = g.from + (g.to - g.from) * ease(u);
        sliderEls[g.cfg.key].value = Math.round(v / g.cfg.step) * g.cfg.step;
      });
      render();
      if (u < 1) requestAnimationFrame(step);
      else { goals.forEach(g => { sliderEls[g.cfg.key].value = g.to; }); render(); }
    };
    requestAnimationFrame(step);
  }

  /* ============================================================
     M2 — Table des actifs
     ============================================================ */
  function buildAssetTable() {
    const tbody = $("#asset-tbody");
    tbody.innerHTML = ASSETS.map(a => `
      <tr class="asset-row ${a.watch ? "watch" : ""}" data-id="${a.id}" tabindex="0"
          aria-expanded="false" title="Cliquer pour le détail financement / contrôle">
        <td class="mono">${a.id}${a.watch ? `<span class="watch-flag" title="Actif à surveiller">●</span>` : ""}</td>
        <td class="asset-name"><strong>${a.name}</strong><span>${a.location} · ${a.type} · ${a.profile}</span></td>
        <td class="num mono">${fpct(a.occupancy, 0)}</td>
        <td class="num mono">${a.wault === null ? `<abbr title="WAULT non applicable : métrique de bail commercial, sans objet en résidentiel">n.a.</abbr>` : nf(a.wault, 1) + NBSP + "ans"}</td>
        <td class="mono"><abbr title="${glossIndex(a.leaseIndex)}">${a.leaseIndex}</abbr></td>
        <td class="num mono" data-cell="value"></td>
        <td class="num mono" data-cell="cap"></td>
        <td class="num mono" data-cell="noi"></td>
        <td class="num mono">${fm(a.debt, 1)}</td>
        <td class="num mono" data-cell="ltv"></td>
        <td class="num" data-cell="bp"></td>
        <td class="chev" aria-hidden="true">▾</td>
      </tr>
      <tr class="asset-detail" data-detail="${a.id}" hidden>
        <td colspan="12"><div class="detail-grid" data-dgrid="${a.id}"></div></td>
      </tr>`).join("");

    tbody.querySelectorAll(".asset-row").forEach(row => {
      const toggle = () => {
        const detail = tbody.querySelector(`[data-detail="${row.dataset.id}"]`);
        const open = detail.hidden;
        detail.hidden = !open;
        row.classList.toggle("open", open);
        row.setAttribute("aria-expanded", String(open));
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
  }

  function glossIndex(ix) {
    return {
      ILAT: "Indice des Loyers des Activités Tertiaires — indexation des bureaux et de la logistique",
      ILC:  "Indice des Loyers Commerciaux — indexation des baux commerce",
      IRL:  "Indice de Référence des Loyers — indexation du résidentiel"
    }[ix];
  }

  function bpBadge(v) {
    const cls = v <= -0.05 ? "bp-red" : v < 0 ? "bp-amber" : "bp-green";
    return `<span class="bp mono ${cls}">${fsig(v * 100, x => nf(x, 1))}${NBSP}%</span>`;
  }

  function renderAssetTable(st) {
    const stressed = !isZero(st.sliders);
    for (const r of st.rows) {
      const row = $(`#asset-tbody .asset-row[data-id="${r.ref.id}"]`);
      row.querySelector('[data-cell="value"]').textContent = fm(r.value, 1);
      row.querySelector('[data-cell="cap"]').textContent = fpct(r.capEff, 2);
      row.querySelector('[data-cell="noi"]').textContent = fm(r.noiS, 2);
      const ltvCell = row.querySelector('[data-cell="ltv"]');
      ltvCell.textContent = fpct(r.ltv, 1);
      ltvCell.classList.toggle("ltv-hot", r.ltv > FUND.covenants.ltvMax);
      row.querySelector('[data-cell="bp"]').innerHTML = bpBadge(r.bpVar);

      $(`[data-dgrid="${r.ref.id}"]`).innerHTML = assetDetail(r, stressed);
    }
    // Ligne de total
    const occW = st.rows.reduce((t, r) => t + r.ref.occupancy * r.value, 0) / st.gav;
    const wRows = st.rows.filter(r => r.ref.wault !== null);
    const wVal = wRows.reduce((t, r) => t + r.value, 0);
    const waultW = wRows.reduce((t, r) => t + r.ref.wault * r.value, 0) / wVal;
    $("#t-occ").textContent = fpct(occW, 1);
    $("#t-wault").textContent = nf(waultW, 1) + NBSP + "ans";
    $("#t-value").textContent = fm(st.gav, 1);
    $("#t-cap").textContent = fpct(st.blended, 2);
    $("#t-noi").textContent = fm(st.noi, 2);
    $("#t-debt").textContent = fm(st.debt, 1);
    const tLtv = $("#t-ltv");
    tLtv.textContent = fpct(st.ltv, 1);
    tLtv.classList.toggle("ltv-hot", st.ltv > FUND.covenants.ltvMax);
    $("#t-bp").innerHTML = bpBadge(st.bpVarTotal);
    $("#table-note").textContent = stressed
      ? "Valeurs, caps, NOI et LTV affichés sous le stress courant. Les écarts BP restent mesurés sur le réalisé (NOI de base)."
      : "Occupation et WAULT du total : moyennes pondérées par la valeur (WAULT hors résidentiel).";
  }

  function assetDetail(r, stressed) {
    const a = r.ref;
    const item = (l, v) => `<div class="d-item"><span>${l}</span><strong class="mono">${v}</strong></div>`;
    return `
      <div class="d-col">
        <h4>Financement</h4>
        ${item("Taux all-in", fpct(a.allInRate, 2))}
        ${item("Part variable brute", fpct(a.floatShare, 0))}
        ${item("Couverture estimée", fpct(a.hedgeRatio, 0))}
        ${item("Exposition nette taux", `${fm(r.netExp, 2)} (${fpct(r.netExp / a.debt, 1)} de la dette)`)}
        ${item("Service annuel" + (stressed ? " (stressé)" : ""), fm(r.service, 2))}
        ${item("Capex / TI reserve", fm(a.capexReserve, 2))}
      </div>
      <div class="d-col">
        <h4>Contrôle</h4>
        ${item("BP NOI", fm(a.bpNoi, 2))}
        ${item("Écart NOI vs BP", `${fsig(r.bpVar * 100, x => nf(x, 1))}${NBSP}%`)}
        ${item("Check NOI ÷ cap", `${fm(a.noi / a.cap, 1)} · écart ${fm(Math.abs(r.reconDiff), 2)} ✓`)}
        <div class="d-anchor"><span>Ancrage du cap rate</span>${a.capAnchor}</div>
        ${a.watchNote ? `<div class="d-watch">${a.watchNote}</div>` : ""}
      </div>`;
  }

  /* ============================================================
     M5 — Pont NOI → cash-flow (waterfall SVG)
     ============================================================ */
  function renderWaterfall(st) {
    const W = 660, H = 230, padL = 16, padB = 34, top = 26;
    const maxV = baseState.noi * 1.05;
    const y = v => H - padB - (v / maxV) * (H - padB - top);
    const bw = 120;
    const xs = [padL + 40, padL + 250, padL + 460];
    const bars = [
      { x: xs[0], from: 0, to: st.noi, cls: "wf-noi", label: "NOI", val: fm(st.noi, 2) },
      { x: xs[1], from: st.cf, to: st.noi, cls: "wf-capex", label: "− Capex / TI", val: "−" + fm(st.capex, 2) },
      { x: xs[2], from: 0, to: st.cf, cls: "wf-cf", label: "Cash-flow immobilier", val: fm(st.cf, 2) }
    ];
    const connector = (x1, x2, v) =>
      `<line class="wf-link" x1="${x1}" y1="${y(v)}" x2="${x2}" y2="${y(v)}"/>`;
    $("#waterfall").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pont du NOI au cash-flow immobilier après capex">
        <line class="wf-axis" x1="0" y1="${y(0)}" x2="${W}" y2="${y(0)}"/>
        ${connector(xs[0] + bw, xs[1], st.noi)}
        ${connector(xs[1] + bw, xs[2], st.cf)}
        ${bars.map(b => `
          <rect class="${b.cls}" x="${b.x}" y="${y(b.to)}" width="${bw}" height="${Math.max(2, y(b.from) - y(b.to))}" rx="3"/>
          <text class="wf-val" x="${b.x + bw / 2}" y="${y(b.to) - 8}" text-anchor="middle">${b.val}</text>
          <text class="wf-label" x="${b.x + bw / 2}" y="${H - 12}" text-anchor="middle">${b.label}</text>`).join("")}
      </svg>`;
    $("#dscr-chips").innerHTML = `
      <div class="chip-dscr">
        <span>DSCR covenant <abbr title="NOI ÷ service de la dette, dette interest-only">(IO)</abbr></span>
        <strong class="mono">${fx2(st.dscr)}</strong>${pill(st.dscrStatus)}
      </div>
      <div class="chip-dscr">
        <span>DSCR économique <abbr title="(NOI − capex/TI) ÷ service de la dette — indicateur analytique, pas un covenant">(après capex/TI)</abbr></span>
        <strong class="mono">${fx2(st.dscrCapex)}</strong>
        <span class="chip-note">${st.dscrCapex < FUND.covenants.dscrMin
          ? "sous le seuil covenant, à titre indicatif"
          : "pas un covenant — lecture analytique"}</span>
      </div>`;
  }

  /* ============================================================
     M9 — Prévisionnel de trésorerie 12 mois (couplé au scénario)
     ============================================================ */
  function renderTreasury(st) {
    const tr = computeTreasury(st);
    const T = TREASURY;
    const mLab = i => monthLabelFR(T.startYear, T.startMonthIndex, i);

    // Chips de synthèse
    $("#tr-chips").innerHTML = `
      <div class="chip-dscr"><span>Solde fin de période</span>
        <strong class="mono">${fm(tr.closing, 1)}</strong><span class="chip-note">mars 2027</span></div>
      <div class="chip-dscr"><span>Point bas</span>
        <strong class="mono">${fm(tr.minBal, 1)}</strong>
        <span class="chip-note">${mLab(tr.minIdx)} · seuil interne ${fm(T.cashMin, 1)}</span></div>
      <div class="chip-dscr"><span>Distributions sur 12 mois</span>
        ${tr.suspended
          ? `<strong class="mono trap">suspendues</strong><span class="chip-note trap">cash trap : −${fm(tr.suspendedAmount, 1)} pour les porteurs</span>`
          : `<strong class="mono">${fm(tr.distTotal, 1)}</strong><span class="chip-note">semestrielles (juin / déc.)</span>`}
      </div>`;

    // Graphique : solde de clôture mensuel + seuil interne
    const W = 760, H = 230, padL = 40, padB = 32, top = 16;
    const maxY = Math.max(13, Math.ceil(tr.closing) + 1, Math.ceil(Math.max(...tr.months.map(m => m.closing))) + 1);
    const y = v => H - padB - (v / maxY) * (H - padB - top);
    const slot = (W - padL - 10) / 12;
    const xc = i => padL + i * slot + slot / 2;

    const pts = tr.months.map((m, i) => `${xc(i)},${y(m.closing)}`).join(" ");
    const area = `M ${padL + slot / 2},${y(T.openingCash)} L ${pts.split(" ").join(" L ")} L ${xc(11)},${y(0)} L ${xc(0)},${y(0)} Z`;

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Solde de trésorerie prévisionnel sur 12 mois">
      <line class="wf-axis" x1="${padL}" y1="${y(0)}" x2="${W - 10}" y2="${y(0)}"/>
      <line class="tr-min" x1="${padL}" y1="${y(T.cashMin)}" x2="${W - 10}" y2="${y(T.cashMin)}"/>
      <text class="fl-bandlabel" x="${W - 14}" y="${y(T.cashMin) - 5}" text-anchor="end">seuil ${nf(T.cashMin, 1)}</text>
      <path class="tr-area" d="${area}"/>
      <polyline class="tr-line" points="${pts}"/>`;

    tr.months.forEach((m, i) => {
      const isDist = T.distributionMonths.includes(i);
      svg += `<circle class="tr-dot" cx="${xc(i)}" cy="${y(m.closing)}" r="3.4">
        <title>${mLab(i)} : solde ${fm(m.closing, 2)} · loyers +${nf(m.inflow, 2)} · service −${nf(m.service, 2)} · capex −${nf(m.capex, 2)} · distribution −${nf(m.dist, 2)}</title>
      </circle>`;
      if (isDist) {
        svg += tr.suspended
          ? `<text class="tr-dist-x" x="${xc(i)}" y="${y(m.closing) - 10}" text-anchor="middle">✕ susp.</text>`
          : `<text class="tr-dist" x="${xc(i)}" y="${y(m.closing) + 18}" text-anchor="middle">−${nf(T.distributionAmount, 1)}</text>`;
      }
      svg += `<text class="fl-xlabel" x="${xc(i)}" y="${H - 10}" text-anchor="middle">${mLab(i)}</text>`;
    });
    svg += "</svg>";
    $("#tr-chart").innerHTML = svg;

    // Table mensuelle (l'artefact controller)
    const rows = tr.months.map((m, i) => `<tr>
      <td class="mono">${mLab(i)}</td>
      <td class="num mono">+${nf(m.inflow, 2)}</td>
      <td class="num mono">${m.service ? "−" + nf(m.service, 2) : "—"}</td>
      <td class="num mono">−${nf(m.capex, 2)}</td>
      <td class="num mono">−${nf(m.fees, 2)}</td>
      <td class="num mono ${tr.suspended && TREASURY.distributionMonths.includes(i) ? "trap" : ""}">${
        m.dist ? "−" + nf(m.dist, 2) : (tr.suspended && TREASURY.distributionMonths.includes(i) ? "susp." : "—")}</td>
      <td class="num mono"><strong>${nf(m.closing, 2)}</strong></td>
    </tr>`).join("");
    const sum = f => tr.months.reduce((t, m) => t + f(m), 0);
    $("#tr-tbody").innerHTML = rows;
    $("#tr-tfoot").innerHTML = `<tr>
      <td>12 mois</td>
      <td class="num mono">+${nf(sum(m => m.inflow), 2)}</td>
      <td class="num mono">−${nf(sum(m => m.service), 2)}</td>
      <td class="num mono">−${nf(sum(m => m.capex), 2)}</td>
      <td class="num mono">−${nf(sum(m => m.fees), 2)}</td>
      <td class="num mono">${tr.distTotal ? "−" + nf(tr.distTotal, 2) : "0,00"}</td>
      <td class="num mono"><strong>${nf(tr.closing, 2)}</strong></td>
    </tr>`;

    $("#tr-note").textContent = tr.suspended
      ? "Breach covenant : distributions suspendues (cash trap) — la trésorerie s'accumule dans le fonds mais cesse d'être distribuable aux porteurs tant que le breach court."
      : "Couplé au scénario courant : les encaissements suivent le NOI stressé, le service de dette suit le choc de taux. Ouverture €" + nf(TREASURY.openingCash, 1) + "m au 31/03/2026.";
  }

  /* ============================================================
     M10 — Atterrissage budgétaire 2026e (statique)
     ============================================================ */
  function buildLanding() {
    const ld = computeLanding();
    $("#landing-tbody").innerHTML = ld.rows.map(r => `<tr>
      <td><strong class="mono">${r.id}</strong> <span class="ld-name">${r.asset.name}</span></td>
      <td class="num mono">${fm(r.bp, 2)}</td>
      <td class="num mono">${fm(r.q1Actual, 2)}</td>
      <td class="num mono">${fm(r.landing, 2)}</td>
      <td class="num">${bpBadge(r.gap)}</td>
      <td class="ld-cause">${r.cause}</td>
    </tr>`).join("");
    $("#landing-tfoot").innerHTML = `<tr>
      <td>Portefeuille</td>
      <td class="num mono">${fm(ld.totals.bp, 2)}</td>
      <td class="num mono">${fm(ld.totals.q1, 2)}</td>
      <td class="num mono">${fm(ld.totals.landing, 2)}</td>
      <td class="num">${bpBadge(ld.totals.gap)}</td>
      <td></td>
    </tr>`;
  }

  /* ============================================================
     M6 — Contrôle des flux (z-score) — statique
     ============================================================ */
  function buildFlows() {
    const { values, zThreshold, annotations, startYear, startMonthIndex } = MONTHLY_FLOWS;
    const { mean, sd, z } = zScores(values);
    const W = 760, H = 250, padL = 44, padB = 36, top = 18;
    const maxV = 1.95;
    const y = v => H - padB - (v / maxV) * (H - padB - top);
    const slot = (W - padL - 8) / values.length;
    const bw = slot * 0.62;

    const monthLabel = i => monthLabelFR(startYear, startMonthIndex, i);

    const bandTop = y(mean + zThreshold * sd), bandBot = y(mean - zThreshold * sd);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Encaissements locatifs nets mensuels sur 24 mois, anomalies détectées par z-score">
      <rect class="fl-band" x="${padL}" y="${bandTop}" width="${W - padL - 8}" height="${bandBot - bandTop}"/>
      <line class="fl-mean" x1="${padL}" y1="${y(mean)}" x2="${W - 8}" y2="${y(mean)}"/>
      <text class="fl-bandlabel" x="${W - 12}" y="${bandTop - 4}" text-anchor="end">+2,5σ</text>
      <text class="fl-bandlabel" x="${W - 12}" y="${bandBot + 12}" text-anchor="end">−2,5σ</text>
      <line class="wf-axis" x1="${padL}" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}"/>
      <text class="fl-ylabel" x="${padL - 6}" y="${y(mean) + 4}" text-anchor="end">${nf(mean, 2)}</text>`;

    values.forEach((v, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const flagged = Math.abs(z[i]) > zThreshold;
      const cls = !flagged ? "fl-bar" : (z[i] > 0 ? "fl-bar-pos" : "fl-bar-neg");
      svg += `<rect class="${cls}" x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="2">
        <title>${monthLabel(i)} : ${fm(v, 2)} · z = ${nf(z[i], 2)}σ${annotations[i] ? " — " + annotations[i] : ""}</title>
      </rect>`;
      if (flagged) {
        svg += `<text class="${z[i] > 0 ? "fl-z-pos" : "fl-z-neg"}" x="${x + bw / 2}" y="${y(v) - 7}" text-anchor="middle">${(z[i] > 0 ? "+" : "−") + nf(Math.abs(z[i]), 1)}σ</text>`;
      }
      if (i % 3 === 0) {
        svg += `<text class="fl-xlabel" x="${x + bw / 2}" y="${H - 12}" text-anchor="middle">${monthLabel(i)}</text>`;
      }
    });
    svg += "</svg>";
    $("#flows-chart").innerHTML = svg;

    $("#flows-legend").innerHTML = Object.entries(annotations).map(([i, txt]) => {
      const idx = Number(i);
      const sign = z[idx] > 0 ? "fl-leg-pos" : "fl-leg-neg";
      return `<li><span class="leg-swatch ${sign}"></span>
        <strong>${monthLabel(idx)}</strong> (${(z[idx] > 0 ? "+" : "−") + nf(Math.abs(z[idx]), 1)}σ) — ${txt}</li>`;
    }).join("");
  }

  /* ============================================================
     M7 — Commentaire de gestion (pré-généré)
     ============================================================ */
  function commentText(st) {
    const b = baseState;
    if (isZero(st.sliders)) {
      return {
        title: "Situation de base — " + FUND.asOf,
        text: `Au ${FUND.asOf}, la NAV s'établit à ${fm(b.nav, 1)} pour une GAV de ${fm(b.gav, 1)} (cap blended ${fpct(b.blended, 2)}). ` +
        `La LTV consolidée ressort à ${fpct(b.ltv, 1)} contre un covenant à ${fpct(FUND.covenants.ltvMax, 0)} et le DSCR à ${fx2(b.dscr)} contre ${fx2(FUND.covenants.dscrMin)} : les deux covenants disposent de marges confortables. ` +
        `Le NOI consolidé (${fm(b.noi, 2)}) ressort ${nf(Math.abs(b.bpVarTotal) * 100, 1)}${NBSP}% sous budget, principalement du fait de la Tour La Défense (−10,0${NBSP}% vs BP, vacance à 17${NBSP}%), dont le refinancement 2027 reste le point d'attention majeur. ` +
        `Contexte de marché : l'investissement en Île-de-France s'est replié de 47${NBSP}% sur un an au T1 2026 (€1,3${NBSP}Md, JLL), un marché polarisé où 4 transactions ont concentré 74${NBSP}% des volumes ; les investisseurs internationaux y représentent 40${NBSP}% des engagements. ` +
        `Les prime yields sont stables sur l'ensemble des classes d'actifs : nos valorisations n'intègrent aucune compression. ` +
        (() => { const tr = computeTreasury(b);
          return `Trésorerie : le prévisionnel à 12 mois reste au-dessus du seuil interne (point bas ${fm(tr.minBal, 1)} en ${monthLabelFR(TREASURY.startYear, TREASURY.startMonthIndex, tr.minIdx)}), après ${fm(tr.distTotal, 1)} de distributions semestrielles.`; })()
      };
    }
    if (st.globalStatus === "red") {
      return {
        title: "Scénario adverse — covenant breach",
        text: `Le scénario simulé déclenche un franchissement du covenant LTV : ${fpct(st.ltv, 1)} contre un maximum de ${fpct(FUND.covenants.ltvMax, 0)}, ` +
        `sous l'effet combiné de la contraction du NOI (${fm(st.noi, 2)}, ${fsig((st.noi / b.noi - 1) * 100, x => nf(x, 1))}${NBSP}%) et de l'expansion des cap rates qui ramène la GAV à ${fm(st.gav, 1)}. ` +
        `Le DSCR demeure conforme (${fx2(st.dscr)} contre ${fx2(FUND.covenants.dscrMin)} ; ${fx2(st.dscrCapex)} après capex/TI) : la rupture vient de la valeur, non du service de la dette. ` +
        `Conséquences types à instruire avec les prêteurs : constat de breach à la prochaine date de test, période de remédiation, options de cure (apport d'equity, remboursement partiel, sûretés complémentaires) ; le prévisionnel de trésorerie suspend en conséquence ${fm(computeTreasury(st).suspendedAmount, 1)} de distributions sur 12 mois (cash trap). ` +
        `Mise en perspective : un tel scénario supposerait une rupture du régime actuel de stabilité des prime yields constaté par JLL au T1 2026, dans un marché déjà atone (Île-de-France −47${NBSP}% sur un an ; logistique France −62${NBSP}%, internationaux à 25${NBSP}% de l'I&L contre 54${NBSP}% de moyenne quinquennale).`
      };
    }
    return {
      title: "Sous stress — sans breach",
      text: `Sous les hypothèses de stress affichées, la GAV ressort à ${fm(st.gav, 1)} (${fsig(st.gav - b.gav, x => fm(x, 1))} vs situation au ${FUND.asOf}) et la LTV à ${fpct(st.ltv, 1)}, pour un covenant à ${fpct(FUND.covenants.ltvMax, 0)} — statut ${STATUS_LABEL[st.ltvStatus].toLowerCase()}. ` +
      `Le DSCR s'établit à ${fx2(st.dscr)} (covenant ${fx2(FUND.covenants.dscrMin)}) : la structure interest-only et la couverture de taux (exposition nette limitée à ${fm(st.netExp, 1)}, soit ${fpct(st.netExp / st.debt, 0)} de la dette) absorbent l'essentiel du choc de taux. ` +
      `Rappel méthodologique : JLL constate des prime yields stables au T1 2026 (bureaux et commerce prime à 4,00${NBSP}%, logistique à 4,80${NBSP}%) ; l'expansion de cap rates simulée ici est un scénario adverse hypothétique, pas une anticipation. ` +
      `Le portefeuille reste le plus sensible au canal valeur (cap rates → GAV → LTV) ; le canal cash (NOI, taux) dispose de marges nettement supérieures.`
    };
  }

  function generateComment() {
    const btn = $("#btn-comment");
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="gen-dots"><span></span><span></span><span></span></span> Génération…`;
    const out = $("#comment-output");
    out.classList.remove("show");
    setTimeout(() => {
      const st = computeState(currentStress());
      const { title, text } = commentText(st);
      out.innerHTML = `<h4>${title}</h4><p>${text}</p>`;
      out.classList.add("show");
      out.hidden = false;
      lastCommentKey = JSON.stringify(st.sliders);
      $("#comment-stale").hidden = true;
      btn.disabled = false;
      btn.textContent = "Régénérer le commentaire";
    }, 950);
  }

  function checkCommentStale(st) {
    if (lastCommentKey === null) return;
    $("#comment-stale").hidden = JSON.stringify(st.sliders) === lastCommentKey;
  }

  /* ============================================================
     Export CSV de la grille (état de base, séparateur ; pour Excel FR)
     ============================================================ */
  function exportCsv() {
    const d = x => String(x).replace(".", ",");
    const head = ["ID", "Actif", "Type", "Profil", "Localisation", "Occupation", "WAULT (ans)", "Index",
                  "Valeur (EURm)", "Cap rate", "NOI (EURm)", "Dette (EURm)", "LTV actif",
                  "Taux all-in", "Part variable", "Couverture", "Expo nette (EURm)",
                  "Service (EURm)", "Capex/TI (EURm)", "BP NOI (EURm)", "Ecart NOI vs BP"];
    const lines = baseState.rows.map(r => { const a = r.ref; return [
      a.id, a.name, a.type, a.profile, a.location, d(a.occupancy), a.wault === null ? "n.a." : d(a.wault),
      a.leaseIndex, d(a.value), d(a.cap), d(a.noi), d(a.debt), d(+r.ltv.toFixed(4)),
      d(a.allInRate), d(a.floatShare), d(a.hedgeRatio), d(+r.netExp.toFixed(3)),
      d(+r.service.toFixed(4)), d(a.capexReserve), d(a.bpNoi), d(+r.bpVar.toFixed(4))
    ]; });
    const csv = "﻿" + [head, ...lines].map(row => row.join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "grille_actifs_core_plus_france.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ============================================================
     Barre sticky + raccourcis clavier
     ============================================================ */
  function renderSticky(st) {
    setNum($("#sb-ltv"), st.ltv, v => fpct(v, 1));
    setNum($("#sb-dscr"), st.dscr, fx2);
    $("#sb-ltv-pill").innerHTML = pill(st.ltvStatus, "");
    $("#sb-dscr-pill").innerHTML = pill(st.dscrStatus, "");
    $("#hdr-status").innerHTML = pill(st.globalStatus,
      st.globalStatus === "green" ? "Covenants conformes" :
      st.globalStatus === "amber" ? "Zone d'alerte" : "Covenant breach");
  }

  /* ============================================================
     Rendu central
     ============================================================ */
  function render() {
    const st = computeState(currentStress());
    renderKpis(st);
    renderGauges(st);
    renderSliders(st);
    renderAssetTable(st);
    renderWaterfall(st);
    renderTreasury(st);
    renderSticky(st);
    checkCommentStale(st);
    window.__COCKPIT__.state = st;
  }

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    baseState = computeState(ZERO_STRESS);
    window.__COCKPIT__ = { computeState, runSelfTests, baseState };

    buildKpis();
    buildGauges();
    buildSliders();
    buildAssetTable();
    buildLanding();
    buildFlows();

    $("#btn-bear").addEventListener("click", () => applyScenario(BEAR));
    $("#sb-bear").addEventListener("click", () => applyScenario(BEAR));
    $("#btn-reset").addEventListener("click", () => applyScenario(ZERO_STRESS));
    $("#btn-comment").addEventListener("click", generateComment);
    $("#dl-csv").addEventListener("click", e => { e.preventDefault(); exportCsv(); });

    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(input|textarea|select)$/i.test(e.target.tagName) && e.target.type !== "range") return;
      if (e.key === "b" || e.key === "B") applyScenario(BEAR);
      if (e.key === "r" || e.key === "R") applyScenario(ZERO_STRESS);
      if (e.key === "g" || e.key === "G") generateComment();
    });

    // Barre sticky : visible une fois le header passé
    const sentinel = $("#hero-sentinel");
    new IntersectionObserver(([entry]) => {
      $("#stickybar").classList.toggle("visible", !entry.isIntersecting);
    }).observe(sentinel);

    // Recette automatique + réconciliation (spec §4.5 / §9)
    const res = runSelfTests();
    console.groupCollapsed(`Cockpit — auto-recette : ${res.passed}/${res.total} tests calculés OK`);
    console.table(res.tests.map(t => ({ test: t.id, libellé: t.label, statut: t.pass ? "✓ PASS" : "✗ FAIL", détail: t.detail })));
    console.table(baseState.rows.map(r => ({
      actif: r.ref.id, "valeur stockée": r.ref.value, "NOI/cap": +(r.ref.noi / r.ref.cap).toFixed(2),
      "écart €m": +r.reconDiff.toFixed(3), "LTV": (r.ltv * 100).toFixed(1) + " %"
    })));
    console.groupEnd();
    const ok = res.passed === res.total;
    $("#footer-recon").innerHTML = ok
      ? `<span class="recon-ok">✓ Réconciliation data : 6/6 actifs (écart max ${fm(res.maxDiff, 2)}) · auto-recette ${res.passed}/${res.total} tests calculés conformes — détail en console</span>`
      : `<span class="recon-ko">✗ Réconciliation KO : ${res.total - res.passed} test(s) en échec — voir console</span>`;

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();

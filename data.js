/* ============================================================
   Cockpit Fund Controlling — Data model (source unique de vérité)
   Données reconciliées et dérivées dans l'interface.
   Conventions : montants en €m, taux et parts en décimal.
   Aucun agrégat ici : tout KPI affiché est DÉRIVÉ de ces inputs.
   ============================================================ */
"use strict";

const ASSETS = [
  {
    id: "A1", name: "Bureau Paris QCA", type: "Bureau", profile: "Core+",
    location: "Paris 8e", occupancy: 0.97, wault: 5.2, leaseIndex: "ILAT",
    value: 94.0, cap: 0.0425, noi: 4.00, debt: 42.0,
    allInRate: 0.0420, floatShare: 0.35, hedgeRatio: 0.50,
    capexReserve: 0.35, bpNoi: 4.10,
    capAnchor: "Prime bureaux IDF 4,00 % (JLL GPR Q1 2026) + 25 bps Core+ non prime",
    watch: false, watchNote: null, valuationDetail: null
  },
  {
    id: "A2", name: "Tour La Défense", type: "Bureau", profile: "Value-add",
    location: "Courbevoie", occupancy: 0.83, wault: 3.1, leaseIndex: "ILAT",
    value: 50.4, cap: 0.0750, noi: 3.78, debt: 31.0,
    allInRate: 0.0485, floatShare: 0.65, hedgeRatio: 0.25,
    capexReserve: 0.95, bpNoi: 4.20,
    capAnchor: "Hypothèse analyste : tour secondaire La Défense, hors périmètre prime — segment fortement décoté post-2022",
    watch: true,
    watchNote: "Actif à surveiller : vacance 17 %, WAULT 3,1 ans, capex/TI €0,95m, refinancement 2027, 48,8 % de la dette en exposition nette aux taux.",
    valuationDetail: null
  },
  {
    id: "A3", name: "Plateforme logistique", type: "Logistique", profile: "Core+",
    location: "Corridor Lyon–Marseille", occupancy: 0.98, wault: 6.8, leaseIndex: "ILAT",
    value: 70.0, cap: 0.0510, noi: 3.57, debt: 32.0,
    allInRate: 0.0405, floatShare: 0.30, hedgeRatio: 0.60,
    capexReserve: 0.25, bpNoi: 3.60,
    capAnchor: "Prime logistique 4,80 % (JLL I&L France Q1 2026) + 30 bps régional non prime",
    watch: false, watchNote: null, valuationDetail: null
  },
  {
    id: "A4", name: "Retail park", type: "Commerce", profile: "Income / secondaire",
    location: "Périphérie Lille", occupancy: 0.92, wault: 4.0, leaseIndex: "ILC",
    value: 39.0, cap: 0.0690, noi: 2.69, debt: 18.0,
    allInRate: 0.0510, floatShare: 0.45, hedgeRatio: 0.30,
    capexReserve: 0.30, bpNoi: 2.75,
    capAnchor: "Contraste volontaire avec le prime commerce 4,00 % (JLL GPR) : un retail park de périphérie n'est pas du prime high-street",
    watch: false, watchNote: null, valuationDetail: null
  },
  {
    id: "A5", name: "Résidentiel géré", type: "Résidentiel", profile: "Défensif",
    location: "Île-de-France", occupancy: 0.95, wault: null, leaseIndex: "IRL",
    value: 35.0, cap: 0.0440, noi: 1.54, debt: 14.0,
    allInRate: 0.0435, floatShare: 0.30, hedgeRatio: 0.50,
    capexReserve: 0.22, bpNoi: 1.50,
    capAnchor: "Hypothèse analyste (classe d'actif hors périmètre des deux notes JLL)",
    watch: false, watchNote: null, valuationDetail: null
  },
  {
    id: "A6", name: "Bureau Part-Dieu", type: "Bureau", profile: "Core+ régional",
    location: "Lyon 3e", occupancy: 0.94, wault: 4.6, leaseIndex: "ILAT",
    value: 29.0, cap: 0.0550, noi: 1.60, debt: 12.0,
    allInRate: 0.0455, floatShare: 0.40, hedgeRatio: 0.40,
    capexReserve: 0.28, bpNoi: 1.65,
    capAnchor: "Hypothèse analyste : bureau régional Core+",
    watch: false, watchNote: null, valuationDetail: null
  }
];

const FUND = {
  name: "Fonds Core+ France (fictif)",
  asOf: "31/03/2026",
  cash: 8.2,
  otherLiabilities: 6.1,
  shares: 1705000,       // nombre de parts → VL de base €100,00
  covenants: {
    ltvMax: 0.60,        // covenant binding
    ltvAmberFrom: 0.57,  // buffer d'alerte 3 pts
    dscrMin: 1.20,       // covenant matelas (sur DSCR interest-only)
    dscrAmberTo: 1.35    // buffer d'alerte 0,15x
  },
  /* Ratios de structure (hors covenants bancaires) :
     emprise = poids max d'un actif dans la GAV (limite interne) ;
     levier = proxy économique GAV/NAV, repère vs plafond du prospectus
     (non assimilable au levier réglementaire AIFM de l'engagement). */
  ratios: {
    empriseMax: 0.35, empriseAmberFrom: 0.32,
    aifmMax: 2.50, aifmAmberFrom: 2.30
  }
};

/* Scénario Bear : loyers −10 %, vacance +400 bps,
   cap rates +125 bps, taux +150 bps. */
const BEAR = { rent: -0.10, vac: 0.04, cap: 0.0125, rate: 0.015 };

/* Configuration des sliders de stress.
   min/max/step exprimés dans l'unité d'affichage (pt ou bps),
   toDecimal convertit vers la variable du modèle. */
const SLIDERS = [
  {
    key: "rent", label: "Choc sur les loyers", unit: "%",
    min: -20, max: 10, step: 1, base: 0, bear: -10,
    toDecimal: v => v / 100,
    hint: "S'applique au NOI de chaque actif, donc à la fois au cash-flow et à l'assiette de valeur."
  },
  {
    key: "vac", label: "Vacance additionnelle", unit: "bps",
    min: 0, max: 800, step: 50, base: 0, bear: 400,
    toDecimal: v => v / 10000,
    hint: "+100 bps de vacance ≈ −€0,17m de NOI annuel sur ce portefeuille."
  },
  {
    key: "cap", label: "Expansion des cap rates", unit: "bps",
    min: 0, max: 250, step: 25, base: 0, bear: 125,
    toDecimal: v => v / 10000,
    hint: "Seul levier qui ne touche pas le NOI : il comprime la valeur, donc la LTV.",
    warning: "JLL constate des prime yields stables au T1 2026 : ce slider est un stress hypothétique, pas un scénario central."
  },
  {
    key: "rate", label: "Hausse des taux courts", unit: "bps",
    min: 0, max: 300, step: 25, base: 0, bear: 150,
    toDecimal: v => v / 10000,
    hint: "Ne renchérit que l'exposition nette après couverture (€37m sur €149m de dette)."
  }
];

/* Flux mensuels consolidés — encaissements locatifs nets (€m),
   24 mois glissants : avril 2024 → mars 2026.
   Deux anomalies plantées, détectées par z-score |z| > 2,5 :
   index 8  (déc. 2024)  = 1,79 → indemnité de résiliation anticipée (A4)
   index 15 (juil. 2025) = 0,96 → impayé locataire A2, régularisé le mois suivant */
const MONTHLY_FLOWS = {
  startYear: 2024,
  startMonthIndex: 3, // avril (0-based)
  zThreshold: 2.5,
  values: [
    1.42, 1.44, 1.41, 1.45, 1.43, 1.40, 1.46, 1.44, 1.79, 1.42, 1.45, 1.43,
    1.41, 1.44, 1.42, 0.96, 1.43, 1.45, 1.41, 1.44, 1.43, 1.42, 1.46, 1.44
  ],
  annotations: {
    8:  "Indemnité de résiliation anticipée — locataire retail park (A4)",
    15: "Impayé locataire Tour La Défense (A2), régularisé le mois suivant"
  }
};

/* Prévisionnel de trésorerie — 12 mois roulants (avril 2026 → mars 2027).
   Les encaissements suivent le NOI du scénario courant, le service de dette
   suit le choc de taux ; en cas de breach covenant, les distributions sont
   suspendues (cash trap). Montants en €m. */
const TREASURY = {
  startYear: 2026,
  startMonthIndex: 3,          // avril (0-based)
  openingCash: 8.2,            // = FUND.cash au 31/03/2026
  cashMin: 3.0,                // seuil de liquidité interne
  feesMonthly: 0.15,           // frais de gestion & fonctionnement (~1,1 % NAV/an)
  capexQuarterly: [0.80, 0.55, 0.60, 0.40],  // plan travaux T2-26 → T1-27 (Σ = 2,35, gros œuvre A2 front-loaded)
  serviceMonths: [2, 5, 8, 11],              // service de dette trimestriel : juin, sept., déc., mars
  distributionMonths: [2, 8],                // distributions semestrielles : juin et décembre
  distributionAmount: 3.5                    // distribution semestrielle illustrative : 2×3,5 = 7,0/an, un peu au-dessus du cash distribuable (~6,4) → léger prélèvement sur la trésorerie d'ouverture
};

/* Atterrissage budgétaire 2026e — production trimestrielle (post-T1).
   q1Actual = NOI encaissé T1 2026 ; landing = atterrissage annuel estimé.
   Statique : se compare au BP, ne réagit pas aux stress simulés. */
const LANDING = [
  { id: "A1", q1Actual: 1.00, landing: 4.04, cause: "Indexation ILAT moindre qu'anticipé au BP" },
  { id: "A2", q1Actual: 0.95, landing: 3.70, cause: "Départ locataire confirmé au T3 (2 étages), relocation visée 2027" },
  { id: "A3", q1Actual: 0.89, landing: 3.62, cause: "Indexation pleine, occupation 98 %" },
  { id: "A4", q1Actual: 0.67, landing: 2.67, cause: "Franchise accordée au renouvellement du pôle food court" },
  { id: "A5", q1Actual: 0.39, landing: 1.56, cause: "IRL + taux de remplissage supérieur au BP" },
  { id: "A6", q1Actual: 0.40, landing: 1.62, cause: "Vacance ponctuelle d'un plateau au T2" }
];

/* Données de marché vérifiées (deux notes JLL Research Q1 2026),
   utilisées par les commentaires de gestion et le footer. */
const MARKET = {
  sources: [
    {
      title: "Investment, Industrial & Logistics, France — Q1 2026",
      publisher: "JLL Research",
      authors: "Simon-Pierre Richard, Soline Vinçon",
      facts: "Prime entrepôts 4,80 %, locaux d'activité 5,80 % (stables) · I&L France €361m, −62 % sur un an · internationaux 25 % (moyenne 5 ans : 54 %)"
    },
    {
      title: "Investment, Greater Paris Region — Q1 2026",
      publisher: "JLL Research",
      authors: "Stephan von Barczy, Soline Vinçon",
      facts: "Prime bureaux et commerce 4,00 %, logistique 4,80 % (stables) · IDF €1 281m, −47 % sur un an · 4 deals > €100m = 74 % du volume · internationaux 40 %"
    }
  ]
};

const DISCLAIMER = "Fonds fictif à but de démonstration. Cap rates ancrés sur les notes JLL France Q1 2026 (I&L et Greater Paris Region) ; les niveaux par actif sont des hypothèses calibrées, non une base de marché propriétaire.";

/* Export pour l'audit node (tests de recette hors navigateur). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ASSETS, FUND, BEAR, SLIDERS, MONTHLY_FLOWS, TREASURY, LANDING, MARKET, DISCLAIMER };
}

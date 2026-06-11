# Brief consolidé v3 (clean) — Cockpit de Fund Controlling immobilier

Document de référence unique pour le build. Remplace la v2 (fact-checkée le 11/06/2026 contre les deux notes JLL sources : tous les chiffres de marché vérifiés conformes, toute la grille réconciliée par recalcul indépendant). Single-page app **statique** (GitHub Pages, aucun backend, aucune clé API, aucun appel réseau de données). Objectif : démontrer la compréhension du **métier de controller** (NAV, covenants, trésorerie, écarts BP/réalisé), pas la valorisation pure.

---

## A. Corrections apportées depuis la v2

1. **Sourcing complété en section B** : le « −47 % IDF » (utilisé dans les commentaires Phase 3) est désormais documenté avec sa source ; ajout du chiffre internationaux I&L France (25 % vs moyenne 5 ans 54 %).
2. **Périmètres précisés** : internationaux 40 % = tous actifs, Île-de-France (Source 2) ; internationaux 25 % = I&L France entière (Source 1). Ne pas mélanger les deux en commentaire.
3. **A2 reformulé** : « tour secondaire La Défense (Courbevoie), hors périmètre prime » — La Défense n'est pas du « péri-parisien », c'est un quartier d'affaires majeur dont le segment secondaire s'est fortement décoté post-2022. La thèse value-add à 7,50 % reste inchangée et défendable.
4. **Convention de réconciliation explicitée** : la **valeur d'actif est un input** du data model ; NOI/cap est le **contrôle de cohérence** (tolérance < €0,2m par actif). Les agrégats dérivent des valeurs stockées. (Dérivation stricte par NOI/cap donnerait GAV 317,6 — c'est la raison de la convention.)
5. **Modèle de stress figé** (multiplicatif) : NOI stressé = NOI × (1 + choc loyers) × (1 − vacance additionnelle). Bear : 0,90 × 0,96 = −13,6 % ≈ −14 %. GAV Bear calculée **actif par actif** : ≈ €221m (le ≈222 de la v2 venait du raccourci blended).
6. **Conflit fonts tranché** : « aucun appel réseau » s'applique aux données ; les polices sont auto-hébergées (woff2 dans le repo) ou retombent sur la pile système. Pas de CDN au runtime.

Acquis v2 conservés : cap rates ancrés sur sources, grille réconciliée à la décimale, A2 recalibré (cap 7,50 %, €50,4m, LTV 61,5 %), LTV = covenant binding / DSCR = matelas, structure de dette avec hedge, distinction NOI / capex / cash-flow, indices ILAT/ILC/IRL, agrégats 317,4 / 46,9 % / 5,41 % / 170,5, cohérence des deux DSCR Bear.

---

## B. Traçabilité des sources (documentation trail)

Les cap rates et le contexte de marché s'appuient sur deux notes de recherche JLL (PDF dans ce dossier). À garder pour défendre les hypothèses en entretien.

**Source 1 — JLL Research, *Investment, Industrial & Logistics, France, Q1 2026*** (Simon-Pierre Richard, Soline Vinçon).
Données utilisées : prime yield entrepôts **4,80 %**, prime yield locaux d'activité **5,80 %**, les deux **stables** sur un an. Investissement I&L du trimestre **€361m, −62 % sur un an** ; 37 transactions dont 36 < €50m (marché atone, pas de grandes transactions). **Internationaux : 25 %** de l'investissement I&L, contre une moyenne 5 ans de 54 % au T1.

**Source 2 — JLL Research, *Investment, Greater Paris Region, Q1 2026*** (Stephan von Barczy, Soline Vinçon).
Données utilisées : prime yields **bureaux et commerce à 4,00 %**, logistique 4,80 %, locaux d'activité 5,80 %, tous **stables** sur un an. Investissement total du trimestre **€1 281m, −47 % vs T1 2025** (bureaux €589m −47 %, commerce €638m −44 %, I&L €53m −66 %) ; 4 deals > €100m = 74 % du volume (marché très polarisé). **Internationaux : 40 %** de l'investissement tous actifs (45 % au T1 2025).

**Point de cadrage critique tiré des sources** : JLL indique que les prime yields sont **stables**, le repricing ayant déjà eu lieu en 2022-2024 (lecture analyste, cohérente avec les deux notes). Donc le slider « expansion des cap rates » du cockpit est un **stress hypothétique** (rupture du gel + écartement du secondaire), pas un scénario central. Le commentaire de gestion doit le dire, sinon on contredit la donnée.

**Mapping cap rate → source (sourcé vs hypothèse analyste) :**

| Actif | Cap retenu | Ancrage |
|-------|-----------:|---------|
| A1 Bureau Paris QCA (Core+) | 4,25 % | Prime bureaux IDF 4,00 % (Source 2) + 25 bps pour Core+ non prime |
| A3 Logistique corridor | 5,10 % | Prime logistique 4,80 % (Source 1) + 30 bps pour régional non prime |
| A4 Retail park secondaire | 6,90 % | **Contraste volontaire** avec le prime commerce 4,00 % (Source 2) : un retail park de périphérie n'est PAS du prime high-street. C'est le point de littératie. |
| A2 Tour La Défense (value-add) | 7,50 % | Hypothèse analyste : tour secondaire La Défense hors périmètre prime, segment fortement décoté post-2022 (vacance, WAULT court, capex) |
| A5 Résidentiel géré | 4,40 % | Hypothèse analyste (hors périmètre des deux notes) |
| A6 Bureau Lyon Part-Dieu | 5,50 % | Hypothèse analyste : bureau régional Core+ |

**Note d'honnêteté à afficher dans le cockpit** (une ligne, visible) : *« Fonds fictif à but de démonstration. Cap rates ancrés sur les notes JLL France Q1 2026 (I&L et Greater Paris Region) ; les niveaux par actif sont des hypothèses calibrées, non une base de marché propriétaire. »*

---

## C. Hypothèses chiffrées finalisées (réconciliées — recalcul indépendant validé)

### Grille d'actifs

| ID | Actif | Type | Profil | Localisation | Occ. | WAULT | Index | Valeur | Cap | NOI in-place | Dette | LTV actif |
|----|-------|------|--------|--------------|-----:|------:|-------|-------:|----:|-------------:|------:|----------:|
| A1 | Bureau Paris QCA | Bureau | Core+ | Paris 8e | 97 % | 5,2 ans | ILAT | €94,0m | 4,25 % | €4,00m | €42,0m | 44,7 % |
| A2 | Tour La Défense | Bureau | Value-add | Courbevoie | 83 % | 3,1 ans | ILAT | €50,4m | 7,50 % | €3,78m | €31,0m | 61,5 % |
| A3 | Plateforme logistique | Logistique | Core+ | Corridor Lyon–Marseille | 98 % | 6,8 ans | ILAT | €70,0m | 5,10 % | €3,57m | €32,0m | 45,7 % |
| A4 | Retail park | Commerce | Income / secondaire | Périphérie Lille | 92 % | 4,0 ans | ILC | €39,0m | 6,90 % | €2,69m | €18,0m | 46,2 % |
| A5 | Résidentiel géré | Résidentiel | Défensif | Île-de-France | 95 % | n.a. | IRL | €35,0m | 4,40 % | €1,54m | €14,0m | 40,0 % |
| A6 | Bureau Part-Dieu | Bureau | Core+ régional | Lyon 3e | 94 % | 4,6 ans | ILAT | €29,0m | 5,50 % | €1,60m | €12,0m | 41,4 % |

Convention : la **valeur est un input** ; le check de réconciliation NOI/cap doit donner < €0,2m d'écart par actif (max constaté : €0,12m sur A1). Les agrégats dérivent des valeurs stockées.

Note A2 : vacance élevée, WAULT court, capex/TI significatifs, refinancement à surveiller. C'est l'actif « à problème » du portefeuille.

### Structure de dette

| ID | Taux all-in | Part variable brute | Couverture estimée | Exposition nette taux | Service dette annuel | Capex / TI reserve | BP NOI | Écart NOI vs BP |
|----|------------:|--------------------:|-------------------:|----------------------:|---------------------:|-------------------:|-------:|----------------:|
| A1 | 4,20 % | 35 % | 50 % | 17,5 % | €1,76m | €0,35m | €4,10m | −2,4 % |
| A2 | 4,85 % | 65 % | 25 % | 48,8 % | €1,50m | €0,95m | €4,20m | −10,0 % |
| A3 | 4,05 % | 30 % | 60 % | 12,0 % | €1,30m | €0,25m | €3,60m | −0,8 % |
| A4 | 5,10 % | 45 % | 30 % | 31,5 % | €0,92m | €0,30m | €2,75m | −2,2 % |
| A5 | 4,35 % | 30 % | 50 % | 15,0 % | €0,61m | €0,22m | €1,50m | +2,7 % |
| A6 | 4,55 % | 40 % | 40 % | 24,0 % | €0,55m | €0,28m | €1,65m | −3,0 % |

Exposition nette = part variable brute × (1 − couverture). Service = dette × taux all-in (interest-only). Exposition nette pondérée du portefeuille = **€36,95m ≈ €37m** (la base qui encaisse le choc de taux).

### Agrégats fonds

| KPI | Valeur |
|-----|-------:|
| GAV | €317,4m |
| NOI total | €17,18m |
| Cap rate blended | 5,41 % |
| Dette totale | €149,0m |
| LTV consolidée | 46,9 % |
| Cash | €8,2m |
| Autres passifs | €6,1m |
| **NAV** | **€170,5m** |

| KPI dette / contrôle | Valeur |
|----------------------|-------:|
| Service dette annuel | €6,64m |
| DSCR covenant (interest-only) | 2,59x |
| Capex / TI reserve total | €2,35m |
| Cash-flow immobilier après capex | €14,83m |
| DSCR après capex / TI | 2,23x |

### Package covenants

- **LTV max 60 %** — *covenant binding*. Current 46,9 %. Warning buffer 3 pts (ambre entre 57 % et 60 %).
- **DSCR min 1,20x** — *covenant secondaire / matelas*. Current 2,59x. Reste compliant même sous stress (dette IO + exposition taux couverte). *(Remarque assumée : 1,20x est bas vs les ICR covenants de marché, souvent 1,4–1,5x ; c'est volontaire pour que la LTV soit le seul covenant qui mord — à assumer tel quel en entretien.)*

Texte à afficher : *« Le stress principal provient de l'expansion des cap rates, qui comprime la GAV et fait monter la LTV. Le DSCR reste au-dessus du seuil grâce à une dette majoritairement interest-only et une exposition nette aux taux partiellement couverte. »*

### Définition NOI (à gloser inline)

NOI = loyers potentiels − vacance − impayés − charges non récupérables. **Le NOI est AVANT capex/TI.** Le cash-flow immobilier « vrai » = NOI − capex/TI. D'où deux DSCR : le covenant (sur NOI, interest-only) et l'économique (après capex/TI). Ne jamais confondre les deux.

### Indices de loyers français (à gloser inline)

ILAT (Indice des Loyers des Activités Tertiaires) pour bureaux et logistique ; ILC (Indice des Loyers Commerciaux) pour le commerce ; IRL (Indice de Référence des Loyers) pour le résidentiel. WAULT en n.a. pour le résidentiel (métrique de bail commercial).

---

## D. Scénario Bear (calibré pour breach LTV)

Stress combiné : **loyers −10 %, vacance +400 bps, cap rates +125 bps, taux +150 bps.**

**Modèle de stress (figé) :**
- NOI stressé (par actif) = NOI × (1 + Δloyers) × (1 − Δvacance) → Bear : × 0,90 × 0,96 = ×0,864, soit **NOI Bear = €14,84m (−13,6 %, affiché ≈ −14 %)**
- Valeur stressée (par actif) = NOI stressé ÷ (cap + Δcap) ; GAV Bear = somme des valeurs stressées
- Service stressé = service de base + Δtaux × exposition nette (€36,95m)
- Les deux DSCR Bear partent du **même NOI Bear**.

| KPI | Base | Bear |
|-----|-----:|-----:|
| GAV | €317,4m | **€221,3m** (calcul actif par actif) |
| LTV consolidée | 46,9 % | **67,3 %** → **breach** |
| Service de dette | €6,64m | €7,19m (+150 bps sur €36,95m d'expo nette) |
| DSCR covenant (IO) | 2,59x | 2,06x → compliant |
| DSCR après capex/TI | 2,23x | **1,74x** → compliant |
| Seuil covenant DSCR | 1,20x | 1,20x |

DSCR après capex Bear = (14,84 − 2,35) / 7,19 = **1,74x** (1,7374 exactement, vérifié par calcul), dérivé du même NOI Bear que le DSCR IO. Le moment de bascule rouge se produit sur la LTV, pas sur le DSCR, ce qui est le point : un covenant mord, l'autre est un matelas.

**Points de bascule du slider cap rate seul (vérifiés par calcul) :** +100 bps → LTV 55,9 % (vert) ; +125 bps → 58,2 % (**ambre**) ; +150 bps → 60,4 % (**rouge**).

---

## E. Structure de build (rappel condensé)

- **Phase 0** — Data model partagé. Array d'actifs avec champ `valuationDetail` optionnel (hook pour brancher la page DCF immo plus tard sans refactor). Agrégats **dérivés du tableau d'actifs, jamais hardcodés**.
- **Phase 1 (must-have)** — Consolidation : table actifs, GAV, NAV, LTV, DSCR, check covenant (vert/ambre/rouge).
- **Phase 2 (must-have)** — Sliders de stress : choc loyer, vacance, expansion cap rate, hausse des taux. Chaque slider avec **insight chiffré explicite**. Bouton « Scénario Bear » qui pré-positionne le combo et fait basculer en rouge.
- **Phase 3 (light)** — Flag d'anomalie Z-score sur flux mensuels (|z| > 2,5). Bouton « Commentaire de gestion (IA) » : animation « Génération… » ~1s puis texte **pré-généré** selon l'état (base/bear/breach), N.B. honnête visible juste dessous. Planter 2-3 chiffres JLL réels dans les commentaires (IDF −47 %, internationaux 40 % tous actifs / 25 % en I&L, marché polarisé : 4 deals = 74 % du volume).
- **Phase 4 (cuttable)** — Écart BP vs réalisé par actif, prévisionnel de trésorerie roulant, polish.

Corners cuttables : tréso → 1 ligne ; BP/réalisé → 1 chiffre consolidé ; commentaire IA → 1 seul ; sparklines → table simple. **Non-cuttable : Phase 1 + 2.**

Design : ivoire `#F7F2EA`, navy `#14213D`, or `#C9A24B`, rouge breach `#C0392B`, ambre `#E08A1E`, vert OK `#2E7D5B`. Fraunces (titres) / Plus Jakarta Sans (corps) / JetBrains Mono (chiffres). Polices auto-hébergées ou fallback système — pas de CDN.

---

## E bis. Extensions v1.1 (12/06/2026)

Calibrées sur la fiche de poste fund controller visée (vocabulaire exact : VL, atterrissage, ratio d'emprise, AIFM, prévisionnel de trésorerie) :

1. **VL par part** : 1 705 000 parts → VL base €100,00 ; Bear €43,63.
2. **Ratios de structure** : emprise max 29,6 % (A1, limite interne 35 %) ; levier AIFM simplifié GAV/NAV 1,86x (plafond 2,5x — casse à 2,97x sous Bear, même canal valeur) ; LTV nette de cash 44,4 %.
3. **Prévisionnel de trésorerie 12 mois** (avr. 2026 → mars 2027) : ouverture 8,2 ; NOI/12 ; service trimestriel ; capex front-loadé A2 (0,80/0,55/0,60/0,40) ; frais 0,15/mois ; distributions 2 × 3,5 (juin/déc.) ; seuil interne 3,0. Base : clôture 7,59, point bas 5,81 (déc.). **Breach ⇒ distributions suspendues (cash trap)**, clôture Bear 11,70.
4. **Atterrissage budgétaire 2026e** : BP 17,80 / atterrissage 17,21 / écart −3,3 % (driver : A2 −11,9 %, départ locataire T3).
5. **Exports** : pack comité xlsx généré depuis data.js (formules Excel auditables), grille CSV client-side.
6. Recette automatique étendue de 8 à **12 tests** (R11–R14).

---

## F. Checklist de réconciliation pour le build

1. **Dériver** GAV, NOI, blended cap, dette totale, LTV, NAV, service, DSCR du tableau d'actifs. Aucun agrégat hardcodé. Si on re-tweake un actif, tout se recalcule.
2. Au build, **logger les écarts** entre `valeur stockée` et `NOI/cap` pour chaque actif (doit être < €0,2m, sinon corriger le NOI ou le cap).
3. Les deux DSCR Bear partent du **même NOI Bear** (modèle multiplicatif, section D). Ne pas les calculer indépendamment.
4. Écart NOI vs BP de A6 = **−3,0 %**.
5. Le slider cap rate seul doit faire passer la LTV en ambre à +125 bps et en rouge à +150 bps (valeurs vérifiées : 58,2 % et 60,4 %) ; le combo Bear doit afficher LTV ≈ 67 % en rouge. Vérifier que la bascule se déclenche réellement.

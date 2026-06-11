# Spécification fonctionnelle — Cockpit de Fund Controlling immobilier

**Version 1.0 — 11 juin 2026**
Document dérivé du brief consolidé v3 (`BRIEF_cockpit_v3_clean.md`). Toutes les valeurs chiffrées de cette spec ont été réconciliées par recalcul indépendant ; les données de marché sont vérifiées contre les deux notes JLL Q1 2026 jointes au dossier.

---

## 1. Objet et positionnement

### 1.1 Quoi

Une single-page application **100 % statique** (HTML/CSS/JS vanilla, hébergeable sur GitHub Pages) simulant le cockpit de pilotage d'un fonds immobilier core+ français fictif de 6 actifs (~€317m de GAV). L'utilisateur consulte la photo consolidée du fonds (NAV, LTV, DSCR, covenants), applique des stress de marché via des sliders, et observe en temps réel le moment où un covenant casse.

### 1.2 Pourquoi

Pièce de démonstration jointe à une candidature de **fund controller**. Le cockpit doit prouver la maîtrise du métier : consolidation NAV, hiérarchie des covenants (lequel mord, lequel est un matelas), distinction NOI / cash-flow après capex, structure de dette et couverture de taux, écarts BP/réalisé, contrôle de cohérence des données. Il ne cherche **pas** à démontrer de la valorisation sophistiquée (pas de DCF) ni de la technique front-end.

### 1.3 Audience et contexte d'usage

Recruteur ou hiring manager en asset management / fund controlling. Visite de 2 à 5 minutes, depuis un lien dans une lettre de motivation, possiblement sur mobile. Conséquences : le message principal (covenant qui casse sous stress) doit être perceptible en moins de 60 secondes via le bouton « Scénario Bear », sans lecture préalable.

### 1.4 Principes directeurs

1. **Aucun agrégat hardcodé** : tout KPI affiché dérive du tableau d'actifs par calcul. C'est la crédibilité « controller » du projet.
2. **Honnêteté affichée** : fonds fictif, sources citées, limites du modèle dites à l'écran.
3. **Stress = hypothèse, pas prévision** : JLL constate des prime yields stables ; le cockpit le dit explicitement avant de les stresser.
4. **Statique strict** : aucun appel réseau de données, aucune clé API, aucun backend. Polices auto-hébergées ou pile système.

---

## 2. Périmètre

### 2.1 Inclus (must-have)

- **M1** Bandeau KPI consolidés (GAV, NAV, LTV, DSCR, NOI, dette)
- **M2** Table des 6 actifs avec drill-down dette/capex/BP par actif
- **M3** Panneau covenants avec statut vert / ambre / rouge
- **M4** Moteur de stress : 4 sliders + bouton « Scénario Bear » + reset
- **M5** Pont NOI → cash-flow (waterfall NOI − capex/TI, deux DSCR)

### 2.2 Inclus (should-have)

- **M6** Détection d'anomalies sur flux mensuels (z-score, dataset en dur)
- **M7** Commentaire de gestion « IA » (textes pré-générés selon l'état)
- **M8** Écart BP vs réalisé par actif (peut se réduire à une colonne de M2)

### 2.3 Exclus

- Valorisation DCF par actif (hook prévu dans le data model, cf. §3.4, mais aucune UI)
- Persistance, export, impression, multi-devises, i18n (français uniquement)
- Tout backend, authentification, analytics, appel API réel (y compris LLM : le commentaire « IA » est pré-généré, et assumé comme tel à l'écran)

---

## 3. Données de référence

Le data model est l'unique source de vérité, déclaré en tête de script. Conventions : montants en €m, taux en décimal, `null` pour non-applicable.

### 3.1 Grille d'actifs (inputs)

| ID | Actif | Type | Profil | Localisation | Occ. | WAULT (ans) | Index | Valeur | Cap | NOI in-place | Dette |
|----|-------|------|--------|--------------|-----:|------:|-------|-------:|----:|------:|------:|
| A1 | Bureau Paris QCA | Bureau | Core+ | Paris 8e | 97 % | 5,2 | ILAT | 94,0 | 4,25 % | 4,00 | 42,0 |
| A2 | Tour La Défense | Bureau | Value-add | Courbevoie | 83 % | 3,1 | ILAT | 50,4 | 7,50 % | 3,78 | 31,0 |
| A3 | Plateforme logistique | Logistique | Core+ | Corridor Lyon–Marseille | 98 % | 6,8 | ILAT | 70,0 | 5,10 % | 3,57 | 32,0 |
| A4 | Retail park | Commerce | Income / secondaire | Périphérie Lille | 92 % | 4,0 | ILC | 39,0 | 6,90 % | 2,69 | 18,0 |
| A5 | Résidentiel géré | Résidentiel | Défensif | Île-de-France | 95 % | n.a. | IRL | 35,0 | 4,40 % | 1,54 | 14,0 |
| A6 | Bureau Part-Dieu | Bureau | Core+ régional | Lyon 3e | 94 % | 4,6 | ILAT | 29,0 | 5,50 % | 1,60 | 12,0 |

### 3.2 Dette, couverture, capex, budget (inputs)

| ID | Taux all-in | Part variable brute | Couverture | Capex/TI | BP NOI |
|----|------------:|--------------------:|-----------:|---------:|-------:|
| A1 | 4,20 % | 35 % | 50 % | 0,35 | 4,10 |
| A2 | 4,85 % | 65 % | 25 % | 0,95 | 4,20 |
| A3 | 4,05 % | 30 % | 60 % | 0,25 | 3,60 |
| A4 | 5,10 % | 45 % | 30 % | 0,30 | 2,75 |
| A5 | 4,35 % | 30 % | 50 % | 0,22 | 1,50 |
| A6 | 4,55 % | 40 % | 40 % | 0,28 | 1,65 |

### 3.3 Constantes fonds

| Constante | Valeur |
|-----------|-------:|
| Cash | €8,2m |
| Autres passifs | €6,1m |
| Covenant LTV max | 60,0 % |
| Buffer d'alerte LTV (ambre) | 3,0 pts (seuil ambre : 57,0 %) |
| Covenant DSCR min (sur DSCR IO) | 1,20x |
| Buffer d'alerte DSCR (ambre) | 0,15x (seuil ambre : 1,35x) |

### 3.4 Hook d'extension

Chaque actif porte un champ optionnel `valuationDetail: null`, réservé pour brancher ultérieurement une page de valorisation DCF par actif sans refactor du data model. Aucun usage dans la v1.

### 3.5 Flux mensuels (dataset module M6, en dur)

Encaissements locatifs nets mensuels consolidés, 24 mois glissants (M1 = il y a 24 mois), en €m :

```
[1,42, 1,44, 1,41, 1,45, 1,43, 1,40, 1,46, 1,44, 1,79, 1,42, 1,45, 1,43,
 1,41, 1,44, 1,42, 0,96, 1,43, 1,45, 1,41, 1,44, 1,43, 1,42, 1,46, 1,44]
```

Deux anomalies plantées : **M9 = 1,79** (indemnité de résiliation anticipée, locataire A4) et **M16 = 0,96** (impayé locataire A2, régularisé M17). Avec un z-score classique sur la série complète : z(M9) ≈ +2,9 et z(M16) ≈ −3,8 (−3,75 exactement), tous les autres points |z| < 0,5. Le seuil |z| > 2,5 doit flagger exactement ces deux mois.

---

## 4. Modèle de calcul

### 4.1 Ordre de calcul

À chaque changement d'état (slider, preset, reset) : (1) appliquer les stress aux NOI par actif → (2) revaloriser chaque actif → (3) recalculer le service de la dette → (4) agréger → (5) évaluer les covenants → (6) rafraîchir l'UI. Tout en synchrone, O(n) sur 6 actifs : recalcul à chaque événement `input`, sans debounce.

### 4.2 Formules par actif

Soit `s` l'état des sliders : `Δloyers` (décimal, signé), `Δvac` (décimal ≥ 0), `Δcap` (décimal ≥ 0), `Δtaux` (décimal ≥ 0).

| Grandeur | Formule |
|----------|---------|
| NOI stressé | `NOI × (1 + Δloyers) × (1 − Δvac)` |
| Valeur stressée | `NOI stressé ÷ (cap + Δcap)` — à l'état de base (tous sliders à 0), afficher la **valeur stockée** (input), pas NOI/cap |
| Exposition nette taux | `dette × part variable brute × (1 − couverture)` |
| Service stressé | `dette × taux all-in + Δtaux × exposition nette` |
| LTV actif | `dette ÷ valeur (stressée le cas échéant)` |
| Écart NOI vs BP | `NOI ÷ BP NOI − 1` (sur NOI de base, non stressé : le BP se compare au réalisé, pas au scénario) |

**Convention valeur de base vs valeur dérivée** : la valeur d'actif est un input ; NOI/cap sert de contrôle de cohérence (§4.5). Sous stress, la valeur est entièrement dérivée (NOI stressé ÷ cap stressé) — la discontinuité maximale à Δcap → 0 est de €0,12m sur A1, invisible à l'échelle d'affichage.

### 4.3 Formules agrégées

| KPI | Formule | Valeur à l'état de base (contrôle) |
|-----|---------|-----------------------------------:|
| GAV | Σ valeurs | €317,4m |
| NOI total | Σ NOI | €17,18m |
| Cap rate blended | NOI total ÷ GAV | 5,41 % |
| Dette totale | Σ dettes | €149,0m |
| LTV consolidée | Dette ÷ GAV | 46,9 % |
| NAV | GAV − dette + cash − autres passifs | €170,5m |
| Service dette | Σ services | €6,64m |
| DSCR covenant (IO) | NOI total ÷ service | 2,59x |
| Capex/TI total | Σ capex | €2,35m |
| Cash-flow après capex | NOI total − capex total | €14,83m |
| DSCR après capex/TI | (NOI total − capex total) ÷ service | 2,23x |
| Exposition nette totale | Σ expositions nettes | €36,95m |

Le capex/TI n'est **pas** stressé par les sliders (réserve contractuelle, pas un flux de marché).

### 4.4 Règles de statut covenant

| Covenant | Vert | Ambre | Rouge (breach) |
|----------|------|-------|-------|
| LTV (max 60 %) | < 57,0 % | 57,0 % ≤ LTV ≤ 60,0 % | > 60,0 % |
| DSCR IO (min 1,20x) | > 1,35x | 1,20x ≤ DSCR ≤ 1,35x | < 1,20x |

Statut global du fonds = le pire des deux. Le DSCR après capex est affiché à titre analytique (M5) mais **n'est pas un covenant** : pas de statut rouge, seulement une mention si < 1,20x (« sous le seuil covenant à titre indicatif »).

### 4.5 Auto-contrôle de réconciliation (signature controller)

Au chargement, le code vérifie pour chaque actif `|valeur stockée − NOI ÷ cap| < €0,2m` et l'égalité des agrégats recalculés avec les valeurs de contrôle du §4.3 (tolérance d'arrondi €0,05m / 0,05 pt). Résultat affiché discrètement dans le footer : « ✓ Réconciliation data : 6/6 actifs, écart max €0,12m » (et en `console.table` le détail). Si un check échoue, badge rouge « Réconciliation KO » — le bug doit être visible, pas avalé.

---

## 5. Moteur de stress (M4)

### 5.1 Sliders

| # | Slider | Plage | Pas | Défaut | Bear | Variable |
|---|--------|-------|-----|-------:|-----:|----------|
| S1 | Choc sur les loyers | −20 % → +10 % | 1 pt | 0 | −10 % | `Δloyers` |
| S2 | Vacance additionnelle | 0 → +800 bps | 50 bps | 0 | +400 bps | `Δvac` |
| S3 | Expansion des cap rates | 0 → +250 bps | 25 bps | 0 | +125 bps | `Δcap` |
| S4 | Hausse des taux courts | 0 → +300 bps | 25 bps | 0 | +150 bps | `Δtaux` |

Chaque slider affiche sa valeur courante et un **insight chiffré** d'une ligne, recalculé en continu :

- **S1** : « NOI {noi} → DSCR {dscr}x · LTV {ltv} % » — l'assiette de valeur suit le NOI.
- **S2** : « +100 bps de vacance ≈ −€0,17m de NOI annuel » + impact courant.
- **S3** : « GAV {gav} ({Δgav} vs base) · LTV {ltv} % — seul levier qui ne touche pas le NOI ». Avertissement permanent sous S3 : *« JLL constate des prime yields stables au T1 2026 : ce slider est un stress hypothétique, pas un scénario central. »*
- **S4** : « Ne renchérit que l'exposition nette (€37m sur €149m de dette) : service {svc} · DSCR {dscr}x — voilà ce que la couverture achète. »

### 5.2 Points de bascule de référence (vérifiés par calcul, utilisés en recette)

| Réglage (toutes choses égales) | LTV attendue | Statut LTV |
|--------------------------------|-------------:|------------|
| Base (tous sliders à 0) | 46,9 % | Vert |
| S3 = +100 bps | 55,9 % | Vert |
| S3 = +125 bps | 58,2 % | **Ambre** |
| S3 = +150 bps | 60,4 % | **Rouge** |
| Scénario Bear complet | 67,3 % | **Rouge** |

### 5.3 Bouton « Scénario Bear »

Positionne S1−S4 sur les valeurs Bear (−10 % / +400 bps / +125 bps / +150 bps) avec une transition visuelle courte. État cible affiché :

| KPI | Base | Bear |
|-----|-----:|-----:|
| NOI | €17,18m | €14,84m (−13,6 %) |
| GAV | €317,4m | €221,3m |
| LTV | 46,9 % | **67,3 % → BREACH** |
| Service de dette | €6,64m | €7,19m |
| DSCR covenant (IO) | 2,59x | 2,06x → compliant |
| DSCR après capex/TI | 2,23x | 1,74x → compliant |

Les deux DSCR Bear dérivent du **même NOI stressé** — c'est une règle de build, pas un hasard d'arrondi. La narration à l'écran : *« La LTV casse, le DSCR tient : le covenant qui mord est la valeur, pas le cash. »*

### 5.4 Bouton « Reset »

Remet les 4 sliders à 0 et l'affichage à l'état de base. Toujours visible dès qu'un slider ≠ 0.

---

## 6. Modules UI

Ordre vertical de la page (une colonne, sections pleine largeur) : Header → M1 → M3 → M4 → M2 → M5 → M6 → M7 → Footer. (M8 est intégré à M2 en colonne.)

### 6.1 Header

Titre du cockpit, sous-titre « Fonds core+ France — démo de fund controlling », date de situation fictive (« Situation au 31/03/2026 »), et la **note d'honnêteté** en une ligne : *« Fonds fictif à but de démonstration. Cap rates ancrés sur les notes JLL France Q1 2026 (I&L et Greater Paris Region) ; les niveaux par actif sont des hypothèses calibrées, non une base de marché propriétaire. »*

### 6.2 M1 — Bandeau KPI

6 cartes : GAV, NAV, LTV, DSCR (IO), NOI, Dette totale. Chaque carte montre la valeur courante (stressée le cas échéant) et, si ≠ base, le delta vs base (signe + couleur). LTV et DSCR portent leur pastille de statut covenant. Chiffres en police mono.

### 6.3 M2 — Table des actifs

Une ligne par actif : ID, nom, type, localisation, occupation, WAULT (n.a. pour A5 avec glose « métrique de bail commercial »), index (ILAT/ILC/IRL avec glose au survol), valeur, cap, NOI, dette, LTV actif, **écart NOI vs BP** (M8 : badge coloré, rouge si ≤ −5 %). Valeurs et LTV réagissent aux stress. Ligne A2 marquée visuellement (actif à surveiller) avec note repliable : vacance 17 %, WAULT 3,1 ans, capex €0,95m, refinancement à surveiller, 49 % d'exposition nette taux. Clic sur une ligne → drill-down (taux all-in, part variable, couverture, exposition nette, service, capex/TI, BP NOI). Ligne de total = agrégats.

### 6.4 M3 — Panneau covenants

Deux jauges horizontales :
- **LTV max 60 %** — covenant binding. Curseur sur la valeur courante, zones vert/ambre/rouge matérialisées (57/60).
- **DSCR min 1,20x** — covenant matelas. Échelle inversée (le danger est en bas), zones à 1,35/1,20.

Sous les jauges, le texte de cadrage : *« Le stress principal provient de l'expansion des cap rates, qui comprime la GAV et fait monter la LTV. Le DSCR reste au-dessus du seuil grâce à une dette majoritairement interest-only et une exposition nette aux taux partiellement couverte. »* En cas de breach : bandeau rouge « COVENANT BREACH — LTV {x} % > 60 % » + mention sobre des conséquences types (cash trap, remédiation : cure period, apport d'equity, désendettement partiel).

### 6.5 M5 — Pont NOI → cash-flow

Mini-waterfall en 3 barres : NOI total → − capex/TI → cash-flow immobilier, avec les deux DSCR en regard (covenant 2,59x / économique 2,23x à la base). Glose inline : *« NOI = loyers − vacance − impayés − charges non récupérables, AVANT capex/TI. Deux DSCR : celui du covenant (NOI, interest-only) et l'économique (après capex/TI). Ne jamais confondre les deux. »*

### 6.6 M6 — Contrôle des flux (anomalies)

Bar chart des 24 mois (§3.5). Mois avec |z| > 2,5 surlignés avec étiquette explicative : M9 « +2,9σ — indemnité de résiliation anticipée (A4) », M16 « −3,8σ — impayé locataire A2, régularisé M+1 ». Méthode affichée : « z-score sur 24 mois glissants, seuil ±2,5σ ». Insensible aux stress (données réalisées, pas simulées).

### 6.7 M7 — Commentaire de gestion (« IA »)

Bouton « Générer le commentaire de gestion ». Au clic : animation « Génération… » ~1 s, puis affichage du texte correspondant à l'état courant (3 variantes, §7). Immédiatement sous le texte, en permanence : *« N.B. — Commentaires pré-rédigés sélectionnés selon l'état du portefeuille (pas d'appel à un modèle en production statique). L'exercice montre ce qu'un controller doit relire avant diffusion : chiffres, causalité, conformité aux sources. »*

### 6.8 Footer

Sources complètes (les deux notes JLL, auteurs, trimestre), rappel fonds fictif, badge de réconciliation (§4.5), lien GitHub du repo le cas échéant.

---

## 7. Commentaires de gestion pré-rédigés

Trois variantes. Sélection : **breach** si statut global rouge ; **stress** si au moins un slider ≠ 0 sans breach ; **base** sinon. Les chiffres dynamiques (entre accolades) sont injectés depuis l'état courant — un commentaire qui contredit l'écran est un bug bloquant.

### 7.1 Variante « base »

> Au 31 mars 2026, la NAV s'établit à €170,5m pour une GAV de €317,4m (cap blended 5,41 %). La LTV consolidée ressort à 46,9 % contre un covenant à 60 % et le DSCR à 2,59x contre 1,20x : les deux covenants disposent de marges confortables. Le NOI consolidé (€17,18m) ressort 3,5 % sous budget, principalement du fait de la Tour La Défense (−10,0 % vs BP, vacance à 17 %), dont le refinancement 2027 reste le point d'attention majeur. Contexte de marché : l'investissement en Île-de-France s'est replié de 47 % sur un an au T1 2026 (€1,3 Md, JLL), un marché polarisé où 4 transactions ont concentré 74 % des volumes ; les investisseurs internationaux y représentent 40 % des engagements. Les prime yields sont stables sur l'ensemble des classes d'actifs : nos valorisations n'intègrent aucune compression.

### 7.2 Variante « stress » (sliders actifs, pas de breach)

> Sous les hypothèses de stress affichées, la GAV ressort à {GAV} ({ΔGAV} vs situation au 31/03) et la LTV à {LTV} %, pour un covenant à 60 % — statut {statut LTV}. Le DSCR s'établit à {DSCR}x (covenant 1,20x) : la structure interest-only et la couverture de taux (exposition nette limitée à €37m, soit 25 % de la dette) absorbent l'essentiel du choc de taux. Rappel méthodologique : JLL constate des prime yields stables au T1 2026 (bureaux et commerce prime à 4,00 %, logistique à 4,80 %) ; l'expansion de cap rates simulée ici est un scénario adverse hypothétique, pas une anticipation. Le portefeuille reste le plus sensible au canal valeur (cap rates → GAV → LTV) ; le canal cash (NOI, taux) dispose de marges nettement supérieures.

### 7.3 Variante « breach »

> Le scénario simulé déclenche un franchissement du covenant LTV : {LTV} % contre un maximum de 60 %, sous l'effet combiné de la contraction du NOI ({NOI}, {ΔNOI}) et de l'expansion des cap rates qui ramène la GAV à {GAV}. Le DSCR demeure conforme ({DSCR}x contre 1,20x ; {DSCR capex}x après capex/TI) : la rupture vient de la valeur, non du service de la dette. Conséquences types à instruire avec les prêteurs : constat de breach à la prochaine date de test, période de remédiation, options de cure (apport d'equity, remboursement partiel, sûretés complémentaires) ; un cash trap est probable dans l'intervalle. Mise en perspective : un tel scénario supposerait une rupture du régime actuel de stabilité des prime yields constaté par JLL au T1 2026, dans un marché déjà atone (Île-de-France −47 % sur un an ; logistique France −62 %, internationaux à 25 % de l'I&L contre 54 % de moyenne quinquennale).

---

## 8. Exigences non fonctionnelles

| Domaine | Exigence |
|---------|----------|
| Hébergement | Fichiers statiques servis tels quels (GitHub Pages). Cible : un seul `index.html` + assets fonts ; pas de build step, pas de framework, pas de dépendance runtime externe. |
| Réseau | Zéro requête réseau de données. Polices : woff2 auto-hébergés (Fraunces, Plus Jakarta Sans, JetBrains Mono) avec `font-display: swap` et fallback système ; à défaut, pile système seule. |
| Formatage | Locale française : virgule décimale, espace insécable des milliers, « €317,4m », « 46,9 % », « 2,59x », bps en toutes lettres la première fois. Arrondis : montants 1 décimale, taux 1 à 2 décimales, DSCR 2 décimales. |
| Design | Palette : ivoire `#F7F2EA` (fond), navy `#14213D` (texte/structure), or `#C9A24B` (accents), rouge `#C0392B` (breach), ambre `#E08A1E`, vert `#2E7D5B`. Titres Fraunces, corps Plus Jakarta Sans, chiffres JetBrains Mono. |
| Responsive | Lisible de 360 px à 1440 px. Sur mobile : cartes KPI en grille 2×3, table actifs scrollable horizontalement ou en cartes, sliders pleine largeur. Le bouton « Scénario Bear » reste accessible sans scroll excessif. |
| Accessibilité | Sliders = vrais `<input type="range">` clavier-opérables avec `aria-label` et valeur annoncée ; statuts covenant signalés par texte + forme, jamais par la couleur seule ; contrastes AA sur le fond ivoire. |
| Performance | Recalcul complet < 5 ms (6 actifs, synchrone). Aucune librairie de charting : SVG/CSS natif. Page < 300 Ko fonts comprises. |
| Qualité données | Auto-contrôle de réconciliation au chargement (§4.5) ; échec visible, jamais silencieux. |

---

## 9. Critères d'acceptation (recette)

| # | Test | Résultat attendu |
|---|------|------------------|
| R1 | Chargement, état de base | GAV €317,4m · NAV €170,5m · LTV 46,9 % (vert) · DSCR 2,59x (vert) · NOI €17,18m · dette €149,0m |
| R2 | Badge réconciliation | « 6/6 actifs », écart max affiché €0,12m (A1) ; `console.table` détaillé |
| R3 | S3 = +125 bps, autres à 0 | LTV 58,2 % → statut **ambre** |
| R4 | S3 = +150 bps, autres à 0 | LTV 60,4 % → statut **rouge**, bandeau breach |
| R5 | Bouton « Scénario Bear » | Sliders sur −10 % / +400 / +125 / +150 ; NOI €14,84m ; GAV €221,3m ; LTV 67,3 % rouge ; DSCR 2,06x vert ; DSCR après capex 1,74x ; les deux DSCR issus du même NOI |
| R6 | Bouton « Reset » | Retour exact à R1, sliders à 0 |
| R7 | S4 = +300 bps seul | Service €6,64m + 3 % × €36,95m = €7,75m ; DSCR 2,22x ; LTV inchangée à 46,9 % (le taux ne touche pas la valeur dans ce modèle) |
| R8 | Module anomalies | Exactement 2 mois flaggés : M9 (≈ +2,9σ) et M16 (≈ −3,8σ), étiquettes explicatives présentes |
| R9 | Commentaire IA — 3 états | Base → variante 7.1 ; un slider actif sans breach → 7.2 ; Bear → 7.3. Chiffres injectés = chiffres affichés dans M1. N.B. d'honnêteté visible sous le texte |
| R10 | Écart BP A6 | −3,0 % affiché dans M2 |
| R11 | Réseau | Onglet Network : zéro requête externe après chargement des assets du repo |
| R12 | Mobile 360 px | Tous les modules utilisables, Bear accessible, pas de débordement horizontal |

---

## 10. Glossaire (gloses inline dans le cockpit)

| Terme | Définition courte |
|-------|-------------------|
| GAV / NAV | Valeur brute des actifs / valeur nette = GAV − dette + cash − autres passifs |
| NOI | Loyers potentiels − vacance − impayés − charges non récupérables. **Avant** capex/TI |
| Cap rate | NOI ÷ valeur. « Blended » = au niveau du portefeuille |
| LTV | Dette ÷ valeur. Covenant binding du fonds (max 60 %) |
| DSCR | NOI ÷ service de la dette. Covenant : sur NOI, dette interest-only. Économique : après capex/TI |
| WAULT | Durée ferme résiduelle moyenne pondérée des baux. n.a. en résidentiel |
| ILAT / ILC / IRL | Indices d'indexation des loyers : tertiaire (bureaux, logistique) / commerces / résidentiel |
| Interest-only | Dette sans amortissement : le service = intérêts seuls, le principal est refinancé à l'échéance |
| Exposition nette taux | Dette × part variable × (1 − couverture) : la seule assiette sensible à la hausse des taux |
| Cap rate expansion | Hausse des taux de capitalisation → baisse mécanique des valeurs à NOI constant |
| Cash trap | Blocage des distributions par les prêteurs tant qu'un covenant est en breach ou proche du seuil |

---

## Addendum v1.1 — 12 juin 2026 (extensions implémentées et vérifiées)

Extensions calibrées sur la fiche de poste visée (fund controller, société de gestion immobilière). Toutes vérifiées par la recette automatique, portée de 8 à 12 tests.

### A.1 Valeur liquidative (M1 étendu)

Le fonds compte **1 705 000 parts** → VL de base **€100,00 / part** (NAV ÷ parts). Affichée dans la carte NAV, recalculée sous stress (Bear : €43,63).

### A.2 Ratios de structure (M3 étendu)

Strip de 3 ratios sous les jauges covenants, recalculés en continu :

| Ratio | Base | Bear | Règle |
|-------|-----:|-----:|-------|
| Ratio d'emprise max (poids du 1er actif dans la GAV) | 29,6 % (A1) | 28,4 % | limite interne 35 %, ambre dès 32 % |
| Levier AIFM, approche simplifiée GAV/NAV | 1,86x | 2,97x → **breach** | plafond prospectus 2,50x, ambre dès 2,30x |
| LTV nette de trésorerie (dette − cash) ÷ GAV | 44,4 % | — | informatif |

Le levier AIFM casse sous Bear par le même canal valeur que la LTV — cohérent avec la narration. L'approche GAV/NAV est étiquetée « simplifiée » à l'écran (la méthode réglementaire de l'engagement nette les couvertures).

### A.3 M9 — Prévisionnel de trésorerie 12 mois roulants (avril 2026 → mars 2027)

Hypothèses (constantes `TREASURY`) : ouverture €8,2m ; encaissements = NOI courant ÷ 12 ; service trimestriel (juin/sept./déc./mars) = service courant ÷ 4 ; plan capex trimestriel front-loadé A2 (0,80 / 0,55 / 0,60 / 0,40 = €2,35m) ; frais 0,15/mois ; distributions semestrielles €3,5m (juin, déc.) ; seuil de liquidité interne €3,0m.

**Couplage au scénario** : encaissements et service suivent les sliders ; **en cas de breach covenant, les distributions sont suspendues (cash trap)** — la trésorerie s'accumule (clôture €11,7m sous Bear vs €7,59m en base) mais cesse d'être distribuable.

UI : 3 chips (clôture, point bas, distributions), courbe de solde mensuelle avec seuil et marqueurs de distribution, table mensuelle complète (l'artefact controller) avec ligne 12 mois.

### A.4 M10 — Atterrissage budgétaire 2026e

Table statique par actif : BP 2026, réalisé T1, atterrissage annuel estimé, écart vs BP (badge), cause principale. Totaux : **BP €17,80m, atterrissage €17,21m, écart −3,3 %** (principal driver : A2, départ locataire T3, −11,9 %). Ne réagit pas aux stress (réalisé vs budget).

### A.5 Téléchargements

- **Pack comité (xlsx)** : généré hors ligne depuis `data.js` (node → JSON → openpyxl), mêmes chiffres réconciliés, agrégats et scénario Bear en **formules Excel** auditables. Lien dans le footer.
- **Grille d'actifs (csv)** : export client-side (Blob, séparateur `;`, BOM UTF-8, décimales à virgule — compatible Excel FR), zéro dépendance.

### A.6 Critères d'acceptation ajoutés

| # | Test | Résultat attendu |
|---|------|------------------|
| R11 | VL, emprise, levier (base) | VL €100,00 · emprise max 29,6 % (A1) vert · levier 1,86x vert |
| R12 | Trésorerie, base | Distributions €7,0m · clôture €7,59m · point bas €5,81m (déc. 26) ≥ seuil €3,0m |
| R13 | Trésorerie, Bear | Distributions suspendues (€7,0m de cash trap) · clôture ≈ €11,70m |
| R14 | Atterrissage | Total €17,21m vs BP €17,80m, écart −3,3 % |

Le commentaire de gestion intègre la trésorerie : point bas et distributions en variante base, montant suspendu en variante breach.

---

*Spec dérivée du brief v3 ; toute modification des hypothèses chiffrées doit repasser par le brief et par la checklist de réconciliation (§4.5, brief §F) avant d'être reportée ici.*

# Cockpit de Fund Controlling — Fonds Core+ France (démo)

**Démo en ligne : https://hbenchaouch.github.io/cockpit-fund-controlling/**

Single-page app **100 % statique** simulant le cockpit de pilotage d'un fonds immobilier core+ français fictif de 6 actifs (~€317m de GAV) : consolidation NAV et VL, covenants LTV/DSCR, ratios d'emprise et levier AIFM, stress de marché interactif, prévisionnel de trésorerie 12 mois (avec cash trap), atterrissage budgétaire, contrôle des flux, commentaire de gestion.

Démo réalisée pour appuyer une candidature de **fund controller**. Le projet est spécifié et réconcilié : voir [docs/SPEC_fonctionnelle_cockpit.md](docs/SPEC_fonctionnelle_cockpit.md) et [docs/BRIEF_cockpit_v3_clean.md](docs/BRIEF_cockpit_v3_clean.md).

## Ce que la démo cherche à montrer

- **Rigueur de consolidation** : aucun agrégat saisi à la main — GAV, NAV, VL, LTV, DSCR sont dérivés de la grille d'actifs à chaque interaction. Une recette automatique (12 tests calculés + réconciliation valeur vs NOI/cap des 6 actifs) tourne au chargement ; résultat en pied de page et détail en console.
- **Hiérarchie des covenants** : la LTV est le covenant qui mord (le stress de valeur la pousse au breach), le DSCR est un matelas (dette interest-only, exposition taux couverte). Le scénario Bear est calibré pour faire casser l'une sans l'autre.
- **Lien covenant → trésorerie** : le prévisionnel 12 mois est couplé au scénario courant — en cas de breach, les distributions se suspendent et le cash trap devient visible.
- **Littératie métier** : distinction NOI / cash-flow après capex (deux DSCR), VL par part, ratio d'emprise, levier AIFM, indices ILAT/ILC/IRL, exposition nette après couverture, atterrissage budgétaire vs BP, z-score sur les encaissements.
- **Honnêteté des hypothèses** : cap rates ancrés sur deux notes JLL Research Q1 2026 vérifiables, stress présenté comme hypothétique (prime yields constatés stables), limites du modèle affichées.
- **Pont Excel** : un pack comité `.xlsx` est généré depuis le même data model (`tools/build_pack_xlsx.py`) — agrégats et scénario Bear en formules Excel auditables, onglet de contrôles PASS/FAIL. Téléchargeable depuis la page.

## Lancer en local

Aucun build, aucune dépendance. Servir le dossier en statique :

```
python -m http.server 8787 --directory cockpit
```

puis ouvrir http://localhost:8787. (Ouvrir `index.html` en `file://` fonctionne aussi.)

## Déployer sur GitHub Pages

1. Pousser le contenu du dossier `cockpit/` dans un repo (à la racine ou dans `/docs`).
2. Settings → Pages → Deploy from a branch → sélectionner la branche et le dossier.
3. C'est tout : pas de build step, pas de clé API, zéro requête réseau externe (polices auto-hébergées, ~181 Ko au total).

## Structure

| Fichier | Rôle |
|---------|------|
| `data.js` | Data model unique : 6 actifs, dette/couverture, constantes fonds, scénario Bear, flux mensuels, sources |
| `app.js` | Moteur de calcul pur (testable sous Node : `node -e "console.log(require('./app.js').runSelfTests())"`) + rendu UI |
| `styles.css` | Design system ivoire / navy / or, responsive |
| `index.html` | Squelette des 7 modules |
| `fonts/` | Fraunces, Plus Jakarta Sans, JetBrains Mono (variables, subset latin, auto-hébergées) |

## Raccourcis

`B` Scénario Bear · `R` Réinitialiser · `G` Générer le commentaire de gestion

---

*Fonds fictif à but de démonstration. Cap rates ancrés sur JLL Research, Investment I&L France Q1 2026 et Investment Greater Paris Region Q1 2026 ; les niveaux par actif sont des hypothèses calibrées, non une base de marché propriétaire.*

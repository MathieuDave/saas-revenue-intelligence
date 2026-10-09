# CLAUDE.md — SaaS Revenue Intelligence (V2)

Ce fichier explique le projet à Claude Code. À placer à la racine du dépôt (le dossier qui contient `client/` et `server/`).

## Le projet en bref

Application « Morning Brief » pour un VP Revenue d'une entreprise SaaS. Chaque matin, des agents d'IA analysent les comptes clients et poussent des **décisions** à prendre (risques de départ, renouvellements, occasions de croissance) au lieu d'un tableau de bord à explorer.

- **Projet portfolio** : il doit créer un effet « wow » en entrevue et servir à apprendre le backend.
- **Les données sont synthétiques** et s'arrêtent au **31 août 2026**. Le brief de référence est celui d'août 2026.
- La page principale est `/brief`. La V1 (tableau de bord) est gardée telle quelle comme « l'avant » : **on ne touche pas à son code**.
- Le Command Center a été supprimé le 7 oct. 2026 : ne pas le recréer.

## Le propriétaire

Conseiller en transformation numérique, **débutant en programmation**. Il n'est pas VP Revenue : les choix métier se discutent ensemble.

## Façon de travailler (important)

- **Avancer lentement : une seule action par message**, en expliquant l'idée derrière. Répondre en français.
- Chaque choix métier est présenté en options (A/B/C) avec une recommandation.
- Les choix d'interface se valident sur un prototype avant de coder.
- **Si le propriétaire ne comprend pas l'utilité d'une fonctionnalité, la remettre en question honnêtement** (cas du « Replay », retiré).
- Pour un fichier très modifié : donner le fichier complet. Pour une petite modification : montrer le bloc exact à remplacer et ce qui l'entoure.
- Tester une route dans le navigateur ou avec PowerShell (`Invoke-RestMethod`) avant de l'utiliser. Valider une règle en SQL avant de la coder.
- Git : une commande courte à la fois, `git add` avant `git commit`, `git status` pour vérifier. Ne jamais commiter sans qu'on le demande. Le propriétaire commite parfois plus tard : lui rappeler les commits en attente. Branche de travail : `v2`.
- Ne pas lancer `npm audit fix --force` (1 vulnérabilité signalée côté client, connue).

## Structure

```
client/   React 19 + Vite + TypeScript (Motion pour les animations, Recharts, react-markdown)
server/   Express 5 + TypeScript (tsx) + Databricks SQL
```

### Frontend (`client/src/`)
- `pages/MorningBriefPage.tsx` : la page, l'état partagé (décisions remontées ici), l'intro animée.
- `brief/` : composants et logique du brief.
  - `DecisionDesk.tsx` : la pile de cartes de décision (une à la fois).
  - `MorningTiles.tsx` : « The rest of your morning », dont la tuile « Since last month » (suivi des décisions du mois précédent).
  - `EvidenceDrawer.tsx`, `AccountChat.tsx` : tiroir « See the data » et conversation « Ask the Account Analyst ».
  - `AnalystPanel.tsx` : l'enquête de l'agent en direct (SSE), ouverte par « Investigate ».
  - `deskItems.ts`, `briefText.ts` : logique pure et textes générés à partir des données.
  - `*Api.ts` : appels au backend.
  - `motionKit.tsx`, `BootSequence.tsx` : animations (`MotionConfig reducedMotion="user"`).
- Tout le texte affiché est **généré à partir des données**, jamais écrit en dur pour un compte.

### Backend (`server/src/`)
- `index.ts` : sépare les routes V1 et V2.
- `routes/brief.ts` : `GET /api/brief` (agrégation de requêtes en parallèle, règles de répartition, `TEAM`, `lastDayOfMonth`).
- `routes/decisions.ts` : `GET/POST/DELETE /api/decisions` (table `vp_decisions`).
- `routes/followups.ts` : `GET /api/followups?month=` (décisions du mois précédent vs ce qui s'est passé). Résultat gardé en cache par mois ; `decisions.ts` l'oublie après chaque `POST`/`DELETE` réussi.
- `routes/returns.ts` : « Put back on my desk ».
- `routes/outcomes.ts` : `/api/outcomes`, `/api/track-record`.
- `agents/` : `agentLoop.ts` (moteur d'agent partagé), `accountAnalyst.ts` (Investigate), `accountChat.ts` (Ask), `tools.ts` (`AS_OF_DATE`).
- Évidence d'un compte : `GET /api/accounts/:customerId/evidence?asOf=`. Conversation : `POST /api/accounts/:customerId/ask` (SSE).

## Lancer le projet (3 terminaux)

| Terminal | Dossier | Commande | Port |
|---|---|---|---|
| Backend | `server/` | `npx tsx src/index.ts` | 3000 |
| Frontend | `client/` | `npm run dev` | 5173 |
| Git / PowerShell | racine | — | — |

Si Vite démarre sur :5174, une ancienne instance occupe encore :5173.
Frontend : `npm run build` (vérifie les types) et `npm run lint`. Le backend n'a pas de tests.

## Databricks

- Schéma : `workspace.saas_revenue_intelligence`. Tables clés : `gold_customer_monthly_health`, `gold_customer_signal_events`, `customers`, `support_tickets`, `vp_decisions`.
- Authentification : profil CLI `dbc-34eda56e-c826`.
- **Erreur « refresh token is invalid » / « Could not finish » dans Investigate** : la session Databricks a expiré. Corriger avec :
  `databricks auth login --profile dbc-34eda56e-c826`
  puis réessayer. Pas besoin de redémarrer le backend.
- Les requêtes sont **toujours paramétrées** (`:nom`), jamais de valeurs collées dans le SQL. Les identifiants du schéma viennent d'une constante.
- Lenteur connue (mesurée le 9 oct. 2026) : le **premier appel** après une pause prend 17 à 27 s, car l'entrepôt SQL Databricks se réveille. Ensuite, chaque requête coûte environ 2 s (ouverture de session + requête). `/api/followups` est en cache : 0,01 s dès le 2e appel. Pistes : préchauffer au démarrage du serveur, réutiliser la session.

## Règles à ne pas casser

- **Les agents constatent, ils ne prouvent pas de causalité.** Dire « depuis », jamais « grâce à » : les données ne contiennent aucune action humaine.
- **Un prompt est une consigne, pas une garantie.** Le code impose les garde-fous (compte verrouillé, au moins 184 jours de tickets, 6 mois d'usage).
- La jauge d'objectif = ARR à risque sur le bureau qui a **un responsable ET une échéance**. Jamais une probabilité.
- Règle de répartition v2 (Today / Ready to grow / Info / Team) : voir `server/src/routes/brief.ts`. Ne pas la changer sans en parler.
- Signaux (`gold_customer_signal_events`) : Usage Drop, Support Spike, Negative Feedback, Downgrade, Churn, Expansion Ready.
- Chiffres de confiance de référence : 120 clients perdus, 102 (85 %) signalés dans les 3 mois avant, 2,3 mois d'avance en moyenne. Angle mort : les réductions de contrat.
- Les validations d'entrée sont strictes côté serveur (codes 201/204/400, UUID générés côté serveur).
- Accessibilité : respecter « réduire les animations ».

## Direction visuelle

Dégradé clair `#dbe3f1` → `#f7f8fa`, texte bleu nuit `#13203b`, un seul accent ambré `#d98e2b`. Polices : Schibsted Grotesk (interface) et Newsreader (la voix des agents). Deux colonnes : brief à gauche, panneau sombre des agents à droite. Interface en **anglais**.

## À faire plus tard

- Cache de `/api/brief` par mois. Préchauffage au démarrage (réveiller l'entrepôt et remplir les caches avant la démo).
- Message clair quand la session Databricks expire (au lieu de « Could not finish »).
- Page histoire `/story` (portable en CSS 3D, histoire d'Orion Analytics), construite après le peaufinage de l'app.
- Prévision qui bouge, puis polish. Signaux de glissement lent et de réduction de contrat.
- Nettoyer les composants orphelins : `SituationFeed.tsx`, `SignalFeed.tsx/.css`, `AgentInvestigation.tsx/.css`.
- Corriger `customers.ts` (V1) avec des requêtes paramétrées. Mettre l'application en ligne.

## Documents de référence

Dans le projet claude.ai « Saas-revenue » : `V2_Definition.md` (décisions, plan, règles) et `V2_Morning_Brief_Vision.md` (vision produit). Ils priment sur ce fichier en cas de doute.

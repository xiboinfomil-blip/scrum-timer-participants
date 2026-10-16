# Infomil · Espace participants

Application Next.js App Router / React / TypeScript / Tailwind CSS v4 **autonome**, prévue pour son propre dépôt Git et son propre projet Vercel. Aucun import, asset ou fichier de configuration n’est pris dans le projet scrumTimer à l’exécution. Aucun accès direct à une base de données.

## Interface et référence visuelle

ScrumTimer est la référence : même palette Infomil bleu `#205f9d` / orange `#ec8b23`, fond `#f3f6fb`, typographie système, surfaces arrondies et contrôles Material UI. Le thème est centralisé dans `src/providers/design-provider.tsx`, les composants réutilisables dans `src/components/ui.tsx` et la barre de navigation responsive dans `src/components/portal-shell.tsx`. Tailwind v4 conserve la mise en page ; les couches CSS placent les utilitaires après Material. Le logo SVG est local et autonome, sans requête vers le maître.

Les trois vues Notes du jour / Statistiques / Bilan du jour se trouvent dans la barre supérieure, avec un indicateur orange pour la vue active. Sur mobile, elles passent sur une seconde ligne. Elles restent des vues locales : changer de vue ne démonte pas l’éditeur et n’enregistre jamais un brouillon. Aucun contrôle du minuteur ou de gestion n’est ajouté au portail.

Le bouton « Guide » est disponible dans la barre supérieure, y compris sur mobile. Depuis une équipe, il ouvre une fenêtre Material sans quitter la page ni perdre le brouillon ; Échap ou « Fermer le guide » la referme. Depuis l’accueil, il mène à `/help`, une page accessible sans lien ni requête de données d’équipe. Le guide explique les notes partagées, les conflits et brouillons, les périodes UTC / Maurice, les scores enregistrés, le bilan en lecture seule et la confidentialité du lien.

## Périmètre et confiance

- `/` demande d’ouvrir le lien fourni par le scrum master. Aucun annuaire d’équipes.
- `/t/[token]` ouvre une seule équipe : notes du jour modifiables, statistiques et bilan terminé du jour en lecture seule. Ni humeur à choisir, ni présence à modifier, ni minuteur, ni gestion d’équipe.
- **Aucune authentification personnelle.** Toute personne possédant le lien peut lire les données de l’équipe et écrire une note pour **n’importe quel participant**, absent inclus. Sélectionner un nom n’établit aucune identité. Ne présentez jamais cette interface comme un espace personnel ou privé par participant.
- Le lien est une capacité porteuse : ne pas le publier, le mettre dans un ticket public, une capture ou un outil d’analyse. Il figure nécessairement dans l’historique du navigateur et peut apparaître dans les logs d’infrastructure ; les en-têtes ne suppriment pas ces risques. Éviter les données sensibles dans les notes.
- Aucun cookie, localStorage, sessionStorage, IndexedDB, service worker, analytics, image/font/script distant. Les brouillons sont en mémoire dans l’onglet seulement et disparaissent si l’onglet est fermé malgré l’avertissement du navigateur.

## Installation par le parent / mainteneur

Node **>=22.6** (nécessaire aux tests TypeScript natifs), npm et accès à un registre autorisé. Les versions déclarées sont celles du manifeste scrumTimer existant ; leur disponibilité dépend du registre d’entreprise. Ne pas contourner le proxy, TLS ou les restrictions du registre. L’échafaudage a été créé manuellement après le 404 de create-next-app.

Dans **ce dossier uniquement** : installer les dépendances avec `npm install`, puis exécuter `npm run lint`, `npm run typecheck`, `npm test` et `npm run build`. Conserver le lockfile généré dans ce dépôt. `npm run dev -- --port 3002` démarre le développement sans toucher aux serveurs du maître ; `npm run start -- --port 3002` sert un build terminé. Ne pas reconstruire sous un ancien serveur de production actif.

Scripts disponibles : `dev`, `build`, `start`, `lint`, `typecheck`, `test`. Aucun hook de génération/copie d’assets ni outil de migration.

### Environnement serveur uniquement

Créer localement le fichier `.env.local`, ignoré par Git, ou renseigner les variables dans les paramètres Vercel :

| Variable | Valeur |
| --- | --- |
| `SCRUM_MASTER_URL` | Origine HTTPS exacte du maître, par exemple `https://your-master-project.vercel.app` ; aucun chemin, identifiant, query ou fragment. HTTP autorisé uniquement pour `localhost`, `127.0.0.1` et `::1` en développement. |
| `PARTICIPANT_PORTAL_SECRET` | Même secret aléatoire que sur le maître, au moins 32 caractères sans espace ni contrôle, de préférence 32 octets aléatoires encodés en hex/base64url. Aucun préfixe `NEXT_PUBLIC_`. |

**Modèle `.env.example` à créer par le parent** (sa création est bloquée par la règle d’exclusion Copilot de cet éditeur) : deux lignes `SCRUM_MASTER_URL=https://your-master-project.vercel.app` et `PARTICIPANT_PORTAL_SECRET=`. Aucune vraie clé ne doit figurer dans ce modèle. Aucun secret n’a été copié depuis le maître. Une configuration absente ou incorrecte produit un écran explicite et un HTTP 503 côté API, sans faire échouer le build.

## Connexion au serveur maître (implémentée ; déploiement à configurer)

Le maître doit fournir **uniquement** `GET` et `PUT /api/participant-portal` et vérifier côté serveur :

1. `Authorization: Bearer <PARTICIPANT_PORTAL_SECRET>` par comparaison résistante au timing ; ne jamais journaliser ce header.
2. `X-Team-Link: <token>` : `base64url(JSON.stringify({v:1,teamId})) + '.' + base64url(HMAC-SHA256(secret, encodedPayload))`. Signer la chaîne encodée exacte, pas une seconde sérialisation JSON. Vérifier la signature, version, schéma strict et `teamId` canonique `/^[a-f0-9]{64}$/` ; vérifier l’existence de l’équipe. Aucun teamId supplémentaire fourni par le navigateur n’est accepté.
3. Le périmètre de lecture et d’écriture dérive exclusivement de l’équipe signée. La note doit viser un membre du roster, y compris absent. Vérifier le jour réel à Maurice, révision CAS, limite de texte et règles de nettoyage/expiration. Refuser les révisions concurrentes et jours périmés avec **409**. Révision 0 = absence de note.
4. Ne jamais exiger l’origine du portail sur la requête serveur-à-serveur : elle n’est pas transmise. L’API du maître est protégée par le secret ET le token ; le proxy navigateur impose lui-même Origin pour PUT. Si le maître a un middleware global same-origin, prévoir cette route serveur dédiée sans retirer les autres protections.

Le portail ne vérifie pas le HMAC lui-même et ne fabrique aucun lien : contrôle de forme uniquement, autorisation définitive par le maître. Le secret reste dans les modules serveur (`server-only`). Une rotation du secret invalide **tous** les anciens liens ; une révocation par équipe nécessite un mécanisme explicite côté maître, non prévu dans le format v1 sans expiration. Ne pas promettre de révocation individuelle ou de durée de validité automatique.

### Contrat GET

Réponse JSON : `{team:{id,name,roster:[{id,name,present}]},day:'YYYY-MM-DD',hints:[{participantId,hint,revision}],history:[{id,completedAt,people:[{id,name,mood,speakingSeconds,budgetSeconds,timeUp,score,meterTitle}]}]}`.

`completedAt` est un ISO 8601 avec fuseau, `mood` est 1–4 ou null, `score` est le score stocké 0–1000 ou null, `meterTitle` est une chaîne ou null. Roster et chaque liste de personnes limités à 100, historique à 100 bilans (normalement un daily par jour), hints à 100 ; noms participants 60 caractères, identifiants participants 100, titres 200. Le proxy recrée les objets autorisés et ne transmet pas les champs supplémentaires.

### Contrat PUT

Corps **exactement** `{participantId,hint,day,revision}` ; aucune clé de plus. Texte non vide après trim, 1–600 points de code Unicode, LF seul contrôle autorisé ; CR, tabulations et autres contrôles sont refusés par API. L’éditeur convertit les retours navigateur CRLF vers LF avant envoi. Révision entière entre 0 et 2147483646. Réponse succès `{day,hints}` complète pour l’équipe/journée. Pas de DELETE, pas d’écriture de statistiques ou d’historique.

Le navigateur appelle seulement `/api/team`, header `X-Team-Link`. Le proxy ajoute le Bearer secret, envoie à la destination fixe, refuse les redirections, désactive les caches, borne le corps entrant à 8 Kio réels et le JSON sortant à 2 Mio, et impose 12 s de délai upstream (16 s navigateur). Il ne transmet ni cookies, ni Origin utilisateur, ni erreurs upstream brutes. Les erreurs 401/403/404 du maître deviennent `INVALID_LINK`, 409 reste 409, les pannes restent génériques. Aucun retry automatique d’écriture, aucun CORS permissif, aucun chemin de proxy arbitraire. Prévoir des limites de débit à l’infrastructure et au maître avant exposition publique ; le lien ne remplace pas une politique de sécurité adaptée à des données sensibles.

## Comportement des notes et rafraîchissements

Les notes sont partagées jusqu’au prochain minuit **Indian/Mauritius / UTC+4**, sans heure d’été. L’expiration et le nettoyage durable appartiennent au maître ; le portail n’archive pas les notes. Lecture au montage, à la reprise d’onglet visible, au changement de journée et via Actualiser. Pas de polling permanent. Une lecture obsolète est annulée/gardée par génération ; une écriture invalide la lecture en vol. Les données affichées peuvent être anciennes en cas de panne et sont signalées.

Un éditeur inline garde un seul brouillon dans l’onglet. Les changements d’onglet Notes/Statistiques/Bilan ne démontent pas l’éditeur. Actualiser ne remplace jamais son texte. Une révision/journée différente ou un PUT 409 impose **Recharger pour comparer**, puis **Version examinée : conserver mon brouillon**, puis un nouvel enregistrement manuel. Le brouillon du jour précédent ne passe pas au lendemain sans ce choix explicite. Même un timeout peut avoir enregistré : tout résultat d’écriture incertain bloque un nouvel envoi jusqu’à comparaison. Le remplacement du brouillon par le serveur exige confirmation. Fermer un brouillon modifié exige confirmation ; le navigateur reçoit aussi beforeunload tant qu’un brouillon/enregistrement est en attente.

## Statistiques et bilan

- Période : cinq **jours calendaires UTC**, aujourd’hui inclus ; rejet des dates futures. Le bilan du jour est recherché sur la journée **mauricienne**, jamais le dernier résultat arbitraire.
- Moyenne des scores **stockés**, sans appliquer un nouveau barème. Seuls les passages avec score non null, durée >=1 seconde et budget >0 entrent dans les scores moyens. Moyenne arrondie à l’entier, ex æquo sur cette moyenne avec rangs 1,1,3, comme l’application maître. Les noms utilisent le passage retenu le plus récent par identifiant.
- Humeurs : contexte déclaré uniquement, aucune influence sur les scores. Ni vote ni note de performance d’humeur. Le bilan affiche les valeurs et titres archivés, sans récupérer d’image distante.
- Recherche insensible aux accents et pagination de huit résultats/participants pour les grandes équipes. Contrôles natifs >=44px, focus visible, rendu de noms en texte React, contraste bleu/orange et réduction des mouvements. L’accordéon des mesures peut défiler pour les 100 participants ; les listes principales sont paginées. Validation visuelle à 320px à effectuer par le parent.

## Déploiement Vercel indépendant / Git

1. Ouvrir **scrumParticipants** comme dossier séparé. Vérifier qu’il ne se trouve pas sous un dépôt Git englobant. Ne pas réutiliser le dossier `.git`, `.vercel` ou les secrets DB de scrumTimer.
2. Après installation et validations, créer un dépôt neuf dans ce dossier (`git init`), vérifier `git status`, ajouter les fichiers du portail uniquement et créer le premier commit. Ajouter un **nouveau** remote GitHub, puis pousser la branche principale. Ne pas exécuter ces opérations depuis scrumTimer.
3. Dans Vercel, importer ce nouveau dépôt dans un **nouveau projet**, framework Next.js, racine du dépôt, Node >=22.6 (choisir une version supportée telle que 24), build `npm run build`, installation standard du lockfile. Aucune DB ni volume d’assets à connecter.
4. Ajouter les deux variables serveur au bon environnement (Production / Preview / Development selon besoin), séparément sur le maître et le portail. Déployer le maître avec sa route avant de connecter le portail. Les URL Preview peuvent être protégées par Vercel : configurer une connexion serveur autorisée ; ne pas passer de bypass secret via le navigateur.
5. Redéployer après tout changement de variable. Vérifier domaine final, HTTPS, Origin sur PUT, lien signé réel, erreur de lien altéré, conflit simultané, panne maître, bascule minuit et absence d’accès inter-équipe. Ne pas publier de vrai token dans un test ou dans Git.
6. Garder les accès Vercel/Git restreints, configurer rétention/redaction des logs et aucune télémétrie contenant les URL porteuses. Ne pas mettre de liens externes ni ajouter scripts/font/images tiers sans réévaluer la confidentialité.

## Sécurité et validations restantes

Tous les chemins portent no-referrer, noindex/nofollow/noarchive/nosnippet, nosniff, DENY frame et une CSP limitée à la même origine ; scripts inline nécessaires au bootstrap Next, unsafe-eval seulement en dev. La CSP ne prétend pas être nonce-based. Robots est disallow-all ; ce n’est **pas** un contrôle d’autorisation. Cache-Control no-store est appliqué au proxy et aux pages dynamiques, aucun CDN cache intentionnel pour les données. Ne pas activer de cache public sur ces routes en aval.

Tests purs fournis : contrats et Unicode, schémas serveur, dates et UTC/Maurice, limites cinq jours, exclusion dates futures, scores archivés/ties/mesures, recherche/pagination 100 personnes, origine et destination fixe, JSON borné. Ils ne requièrent ni réseau ni DB.

### Validations exécutées le 16 octobre 2026

Installation réussie via le registre configuré après épinglage de Next/React/Tailwind et de la famille TypeScript ESLint aux versions disponibles. Lockfile autonome conservé. `npm run lint`, `npm run typecheck`, `npm test` (**10 tests**) et `npm run build` réussis. `tests/portal_smoke.py` a réussi **16 cas** : desktop 1366×768 et mobile 320×568, mouvement réduit et normal, notes/recherche/pagination/statistiques/bilan, enregistrement, conflit avec conservation du brouillon, comparaison explicite, rejet de lecture obsolète et erreurs 401/502. Toutes les API de ces tests navigateur étaient simulées, sans lecture ni écriture Neon réelle.

Le maître possède les routes de partage et de pont décrites ici, avec tests de signature et intégration PostgreSQL PGlite d’isolation/CAS. Sa vue des notes est désormais en lecture seule ; les notes pendant la prise de parole sont conservées. Ses tests navigateur de partage et de consultation passent à 320 et 1366px. Les deux déploiements Vercel, secrets réels et liaison bout en bout en hébergement restent à configurer et vérifier. Les essais navigateur ne prouvent pas une intégration de production, ni un audit lecteur d’écran complet, ni tous les cas réseau/multi-onglets. Aucun déploiement ni commit n’a été fait. Le modèle d’environnement n’a pas été créé, en raison de la protection d’éditeur décrite plus haut ; les variables nécessaires sont documentées ci-dessus.
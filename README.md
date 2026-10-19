# Infomil · Espace participants

Application Next.js App Router / React / TypeScript / Tailwind CSS v4 **autonome**, prévue pour son propre dépôt Git et son propre projet Vercel. Aucun import, asset ou fichier de configuration n’est pris dans le projet scrumTimer à l’exécution. Aucun accès direct à une base de données.

## Interface et référence visuelle

ScrumTimer est la référence : même palette Infomil bleu `#205f9d` / orange `#ec8b23`, fond `#f3f6fb`, typographie système, surfaces arrondies et contrôles Material UI. Le thème est centralisé dans `src/providers/design-provider.tsx`, les composants réutilisables dans `src/components/ui.tsx` et la barre de navigation responsive dans `src/components/portal-shell.tsx`. Tailwind v4 conserve la mise en page ; les couches CSS placent les utilitaires après Material. Le logo SVG est local et autonome, sans requête vers le maître.

Les trois vues Notes du jour / Statistiques / Bilan du jour se trouvent dans une navigation compacte en barre supérieure, avec un fond clair pour la vue active. Sur mobile, elles passent sur une seconde ligne. La liste des participants occupe la largeur utile, sans panneau latéral décoratif. Elles restent des vues locales : changer de vue ne démonte pas l’éditeur et n’enregistre jamais un brouillon. Aucun contrôle du minuteur ou de gestion n’est ajouté au portail.

Le bouton « Guide » est disponible dans la barre supérieure, y compris sur mobile. Depuis une équipe, il ouvre une fenêtre Material sans quitter la page ni perdre le brouillon ; Échap ou « Fermer le guide » la referme. Depuis l’accueil, il mène à `/help`, une page accessible sans lien ni requête de données d’équipe. Le guide explique les notes partagées, les conflits et brouillons, les périodes UTC / Maurice, les scores enregistrés, le bilan en lecture seule et la confidentialité du lien.

## Périmètre et confiance

- `/` demande d’ouvrir le lien fourni par le scrum master. Aucun annuaire d’équipes.
- `/t/[token]` ouvre une seule équipe : notes du jour modifiables, statistiques et bilan terminé du jour en lecture seule. Ni humeur à choisir, ni présence à modifier, ni minuteur, ni gestion d’équipe.
- **Aucune authentification personnelle.** Toute personne possédant le lien peut lire les données de l’équipe et écrire une note pour **n’importe quel participant**, absent inclus. Sélectionner un nom n’établit aucune identité. Ne présentez jamais cette interface comme un espace personnel ou privé par participant.
- Le lien est une capacité porteuse : ne pas le publier, le mettre dans un ticket public, une capture ou un outil d’analyse. Il figure nécessairement dans l’historique du navigateur et peut apparaître dans les logs d’infrastructure ; les en-têtes ne suppriment pas ces risques. Éviter les données sensibles dans les notes.
- Aucun cookie, sessionStorage, IndexedDB, service worker, analytics, image/font/script distant. Le localStorage conserve uniquement les préférences d’apparence, les identifiants de participants favoris par identifiant d’équipe et le choix de masquer l’introduction (`scrum-participants-intro='hidden'`), jamais le lien d’accès, les notes ou les brouillons. Si le stockage est bloqué, les réglages restent utilisables sans persistance. Les brouillons restent uniquement en mémoire dans l’onglet ; recharger la page ou fermer l’onglet les perd.

L’introduction propose le bouton facultatif « Ne plus afficher l’introduction », qui enregistre ce choix dans le localStorage. « Passer l’intro » ou Échap ferme seulement l’introduction courante, sans enregistrer cette préférence.

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

## Connexion au serveur maître (contrat et configuration)

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

Les épingles placent les participants favoris en tête, avant pagination ; c’est un raccourci sur cet appareil, pas une identité vérifiée. « Lire la note » développe les trois sections sans ouvrir l’éditeur ni envoyer de requête. Le menu Apparence permet de choisir Clair / Sombre et Compacte / Confortable. Ctrl+Entrée ou Cmd+Entrée enregistre explicitement le brouillon si le bouton est actif, jamais en cas de conflit ou de validation invalide. L’indicateur distingue état à jour, enregistrement en cours, succès confirmé, connexion indisponible et écriture à vérifier ; une lecture réussie ne confirme pas une écriture incertaine.

Chaque note renvoyée par le maître peut inclure `updatedAt` (horodatage ISO 8601 avec fuseau, par exemple `2026-10-19T08:30:00Z`). Le pont le valide et le transmet ; l’interface affiche cette date en heure de Maurice sans attribution d’auteur. Le maître doit enregistrer cette valeur dans la même transaction que la révision, et la renvoyer dans GET et PUT. Ce champ est optionnel pour les anciens serveurs : en son absence, aucune heure de modification n’est inventée. Le corps PUT reste strictement `{participantId,hint,day,revision}` sans `updatedAt` fourni par le client.

Le modal propose trois sections WYSIWYG : « Ce que j’ai fait récemment », « Ce que je fais maintenant » et « Ce que je ferai ensuite ». Une seule section remplie suffit. Les sections sont enregistrées ensemble dans le champ `hint` existant sous forme Markdown, avec les titres gras `**Récemment**`, `**Maintenant**` et `**Ensuite**`, séparés du contenu par une ligne vide. Les sections vides sont omises. Les anciennes notes restent intactes à l’ouverture et apparaissent dans la première section. La limite reste de 600 points de code Unicode au total, titres et marqueurs inclus. Aucun changement de schéma ni de contrat API n’est requis. Les aperçus affichent les libellés des sections et leur contenu sans interpréter de HTML brut.

Les notes sont partagées jusqu’au prochain minuit **Indian/Mauritius / UTC+4**, sans heure d’été. L’expiration et le nettoyage durable appartiennent au maître ; le portail n’archive pas les notes et ne les efface pas localement. Lecture au montage, à la reprise d’onglet visible et via Actualiser. Aucun rafraîchissement programmé à minuit ou après 24 heures, ni polling permanent. Une lecture obsolète est annulée/gardée par génération ; une écriture invalide la lecture en vol. Les données affichées peuvent être anciennes en cas de panne et sont signalées.

L’éditeur s’ouvre dans une fenêtre modale sur ordinateur et en plein écran sur mobile. Les brouillons sont conservés **uniquement en mémoire, par token et par participant**, pendant la vie de l’application dans l’onglet. Les changements de vue Notes/Statistiques/Bilan ne démontent pas l’éditeur. Une navigation de route côté client, y compris Précédent/Suivant dans l’historique, conserve le brouillon : revenir au lien d’équipe puis **rouvrir le participant** pour le retrouver. Actualiser les données ne remplace jamais son texte. En revanche, fermer explicitement l’éditeur abandonne son brouillon après confirmation s’il est modifié ; une navigation de route n’équivaut pas à cet abandon. Recharger la page ou fermer l’onglet perd les brouillons : un avertissement `beforeunload` est demandé lorsqu’un brouillon modifié ou un enregistrement est en attente, sous réserve des restrictions du navigateur. Ce n’est pas une sauvegarde durable.

Une révision/journée différente ou un PUT 409 impose **Recharger pour comparer**, puis **Version examinée : conserver mon brouillon**, puis un nouvel enregistrement manuel. Le brouillon du jour précédent ne passe pas au lendemain sans ce choix explicite. Même un timeout peut avoir enregistré : les écritures non résolues sont retenues **hors de l’éditeur, par token et par participant**, et un garde-fou bloque un nouvel envoi pour le participant concerné, même après fermeture/réouverture ou navigation côté client. Une simple lecture réussie ne lève pas ce blocage : il faut examiner et accepter explicitement la version serveur. Le remplacement du brouillon par le serveur exige confirmation. Un succès confirmé remet le brouillon au texte enregistré et efface l’état de modifications en attente ; toute nouvelle saisie efface le message de succès devenu obsolète.

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

### État des validations au 19 octobre 2026

`npm test` réussit **46 tests Node** : **14 tests existants** (contrats et Unicode, schémas serveur, dates UTC/Maurice, scores archivés, recherche/pagination, politique proxy) et **32 tests d’intégration du handler proxy injectable**, avec faux serveur amont injecté, sans réseau réel ni DB. Ces derniers couvrent notamment les validations GET/PUT, l’origine et la destination fixe, les limites d’octets, le filtrage des réponses, les erreurs, les annulations et le timeout.

La suite [tests/portal_smoke.py](tests/portal_smoke.py) comporte **21 scénarios par moteur**, chacun sur ordinateur 1366×768 et mobile 320×568, avec mouvement réduit et normal : **84 exécutions par moteur** pour la matrice complète. Elle couvre notamment l’introduction, les vues, l’éditeur modal/plein écran, les trois sections riches, les favoris et l’apparence, le clavier, les conflits, les lectures obsolètes, les écritures incertaines, la navigation avec brouillon et deux onglets. Toutes les API sont simulées, sans lecture ni écriture de données réelles. **Chromium, Firefox et WebKit ont chacun réussi les 84 exécutions.** Sept scénarios représentatifs ont aussi réussi sous émulation tactile iPhone 13/WebKit dans les deux modes de mouvement (14 exécutions supplémentaires). ESLint, TypeScript et le build de production réussissent.

Le sélecteur `BROWSER_TEST_ENGINE=chromium|firefox|webkit` choisit le moteur (Chromium par défaut). `BROWSER_TEST_ALL_MOTIONS=1` active les deux modes de mouvement ; sinon seul le mouvement réduit est testé. `BROWSER_TEST_CASES=cas,cas` sélectionne facultativement des scénarios. `BROWSER_TEST_IPHONE=1` ajoute un profil tactile iPhone 13 à la matrice (Chromium ou WebKit seulement, non pris en charge par Firefox). L’émulation WebKit/iPhone n’est **ni un test sur Safari/iOS réel, ni une certification lecteur d’écran**.

Ces vérifications locales ne prouvent ni l’état du déploiement, ni la liaison de production au maître, ni l’isolation réelle en hébergement. Vérifier séparément les domaines, secrets, liens signés, conflits et erreurs avec la configuration de l’environnement cible, sans exposer de token. Elles ne remplacent pas les contrôles manuels d’accessibilité ci-dessous et ne couvrent pas tous les cas réseau.

### Checklist manuelle d’accessibilité avant livraison (à effectuer)

Aucun test manuel avec lecteur d’écran n’est attesté ici. Réaliser et consigner au minimum :

- **NVDA + Firefox sous Windows** : navigation clavier complète, ordre et visibilité du focus, entrée/confinement/retour du focus dans l’introduction, le guide et l’éditeur ; fermeture, confirmation d’abandon et réouverture d’un participant.
- **VoiceOver + Safari sur un appareil iOS réel** : parcours tactile et rotor, accès aux trois sections riches, commandes de mise en forme et boutons du plein écran, sans piège de focus.
- Vérifier les noms, rôles et libellés des champs/boutons, les annonces des états de chargement, succès, erreur et écriture à vérifier ; modifier après succès pour vérifier que l’annonce ne reste pas trompeuse.
- Parcourir un conflit et un timeout : comparaison, acceptation explicite, brouillon conservé et enregistrement bloqué avant examen, y compris après navigation/réouverture.
- Vérifier zoom 200 % et 400 %, agrandissement du texte sur iOS, redistribution du contenu et accès aux actions sans masquage ni défilement horizontal bloquant.
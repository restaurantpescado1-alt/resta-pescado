# Checklist d'acceptation manuelle (aperçu Cloudflare)

Ce document est la vérification humaine finale de l'aperçu de déploiement, dans le
navigateur, par le propriétaire ou par un testeur qui dispose des identifiants de son
compte. Il complète les contrôles automatiques : la vérification en lecture seule
(`npm run smoke:preview -- --url <https://aperçu>`) se fait *avant* et *après* ce manuel
(voir la section « Remise à l'état et vérification finale »).

Chaque scénario se corrige dans l'outil de saisie du tableau de bord, sans redéploiement.
La mention « Remise à l'état » indique comment annuler ce que le test a modifié.

## Étape 0 — Préparation

- [ ] L'aperçu est déployé sur Cloudflare et l'URL commence par `https://`.
- [ ] `npm run db:seed:remote -- --env preview --apply` a créé la carte approuvée
      (34 plats, 5 catégories), les informations confirmées et les zones de livraison.
- [ ] `npm run db:provision:owner -- --env preview --apply` a créé le compte propriétaire.
- [ ] La vérification automatique passe : `npm run smoke:preview -- --url <URL de l'aperçu>` → toutes les cases `PASS`.
- [ ] Vous disposez de l'adresse e-mail et du mot de passe du propriétaire (jamais écrits
      dans ce dépôt).

## 1. Connexion du propriétaire

Ouvrir `/admin`.

- [ ] Sans être connecté, la page redirige vers `/admin/login`.
- [ ] Le formulaire affiche « Adresse e-mail », « Mot de passe » et « Se connecter ».
- [ ] Saisir une adresse erronée : le message « Identifiants incorrects. » apparaît.
- [ ] Se connecter avec les bons identifiants : le « Tableau de bord » s'affiche,
      « Connecté en tant que … » et les quatre sections.

**Remarque** : la connexion est limitée à 5 tentatives par minute ; attendre avant de réessayer.

## 2. Un prix change et apparaît sans redéploiement

- [ ] Aller dans « La carte », rechercher le plat « Dorade ».
- [ ] Modifier le prix (par exemple 1 250 DA) et « Enregistrer ».
- [ ] Ouvrir `/menu` dans un autre onglet : le nouveau prix s'affiche.
- [ ] Revenir à l'onglet : « Activité récente » montre « Prix mis à jour » avec
      l'ancienne et la nouvelle valeur.

**Remise à l'état** : remettre le prix initial dans « La carte » (l'entrée du journal
donne l'ancienne valeur). Le prix s'affiche déjà au public — le site n'est jamais « en
attente de publication ».

## 3. Visibilité et ordre d'un plat

- [ ] Dans « La carte », décocher « Visible sur la carte » pour la « Dorade ».
- [ ] `/menu` ne l'affiche plus ; la ligne reste dans l'outil de saisie.
- [ ] Re-cocher la case : le plat réapparaît.
- [ ] Utiliser les flèches de la ligne pour déplacer un plat dans sa catégorie : la
      position change aussitôt sur `/menu`.

**Remise à l'état** : remettre la case à cocher et repositionner avec les flèches.
Attention : masquer un plat ne le supprime pas ; il revient simplement sur la carte.

## 4. Photographies de plats : téléverser, remplacer, supprimer

- [ ] Dans « La carte », pour la « Dorade », « Remplacer l'image (JPEG, PNG ou WebP,
      2 Mo max.) » puis « Téléverser ».
- [ ] La miniature s'affiche dans l'outil ; `/menu` montre la photo du plat.
- [ ] Remplacer par une autre image : la nouvelle photo remplace l'ancienne sur `/menu`.
- [ ] « Supprimer la photo » : une confirmation est demandée ; accepter.
- [ ] Sur un plat dont l'espèce est illustrée (ex. « Merlan »), le plat réaffiche son
      « illustration de poisson » ; sur un plat sans espèce, le plat devient une simple
      ligne de texte.

**Remise à l'état** : le « Supprimer » *supprime définitivement* l'image stockée. Pour
les tests, utiliser une image jetable ; pour restaurer l'ancienne apparence, retéléverser
le fichier d'origine (un nouvel objet = une nouvelle URL, donc aucun cache périmé).

## 5. La galerie

- [ ] Aller dans « La galerie » : photographies fournies et photographies téléversées.
- [ ] Modifier la légende/description d'une photo fournie : elle change sur `/galerie`.
- [ ] Masquer puis réafficher une photo : elle disparaît puis revient sur `/galerie`.
- [ ] Réordonner deux photos et « Enregistrer l'ordre » : l'ordre change sur `/galerie`.
- [ ] « Ajouter une photographie » : la nouvelle photo s'affiche dans « Photographies
      ajoutées » puis sur `/galerie`.

**Remise à l'état** : pour légende/visibilité/ordre, refaire l'opération inverse (les
valeurs actuelles sont affichées avant chaque modification). Les photos fournies ne
peuvent pas être supprimées. Une photo téléversée supprimée est *irréversiblement*
effacée : pour tester la suppression, téléverser une photo jetable et la supprimer.

## 6. Les informations et la livraison

- [ ] Aller dans « Les informations », noter les valeurs actuelles.
- [ ] Modifier le téléphone ou les horaires : la valeur change sur `/` et `/contact`.
- [ ] Désactiver « Livraison » : les blocs « Livraison » disparaissent de `/` et
      `/contact` ; les réactiver.

**Remise à l'état** : réécrire mot pour mot les valeurs notées. Le site affiche
uniquement ce qui est confirmé : rien n'est fabriqué pour remplir un champ vide.

## 7. Changer le mot de passe

- [ ] Aller dans « Le compte » ; « Changer le mot de passe ».
- [ ] Saisir le mot de passe actuel puis un nouveau : la connexion reste possible avec le
      nouveau ; le message de succès s'affiche.

**Remise à l'état** : se déconnecter, se reconnecter avec le nouveau mot de passe, puis
le re-changer avec l'ancien. Il n'existe **pas** de lien « mot de passe oublié » : aucun
e-mail n'est envoyé par le site (voir « Le compte », il est dit explicitement). Ne pas
tester ce changement sans connaître le mot de passe de secours.

## 8. Navigation mobile et barre d'actions

Ouvrir l'aperçu à 390 px (mode appareil du navigateur).

- [ ] La barre d'actions en bas (« Appeler », « Menu », « Itinéraire ») est visible et
      fonctionnelle : « Appeler » compose le numéro confirmé, « Itinéraire » ouvre la
      carte Google Maps.
- [ ] Aucune page ne déborde horizontalement (pas de défilement latéral).
- [ ] Le menu de navigation mobile s'ouvre et se ferme, et chaque lien mène à la bonne page.

## Remise à l'état et vérification finale

- [ ] Toutes les valeurs sont revenues à l'état d'origine (prix, visibilité, ordre,
      légendes, informations, mot de passe).
- [ ] Re-lancer la vérification automatique :
      `npm run smoke:preview -- --url <URL de l'aperçu>` → toutes les cases `PASS`.
- [ ] « Activité récente » ne contient que les entrées correspondant aux tests effectués.

Note sur le réensemencement : `db:seed:remote` n'effectue que des insertions sans
écrasement ; il ne rétablit **pas** les valeurs que vous avez modifiées dans le tableau
de bord. La remise à l'état se fait donc toujours dans l'outil de saisie, comme décrit
ci-dessus.
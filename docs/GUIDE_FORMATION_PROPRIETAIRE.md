# Guide de formation du propriétaire (court)

Ce guide suffit pour les tâches courantes. Le document complet et détaillé est
`docs/OWNER_GUIDE.md` ; la politique de contenu (ce que le site peut dire ou montrer)
est `docs/CONTENT_POLICY.md`.

Le principe à retenir : **tout changement fait dans le tableau de bord s'affiche sur le
site immédiatement**. Il n'y a pas de bouton « publier » et pas d'attente. À part se
déconnecter, rien ici ne doit être fait ailleurs que dans le tableau de bord.

## 1. Se connecter

1. Ouvrir `/admin` dans le navigateur.
2. Saisir « Adresse e-mail » et « Mot de passe », puis « Se connecter ».
3. Vous arrivez sur le « Tableau de bord » (« Connecté en tant que … »).

En cas d'erreur, le message est « Identifiants incorrects. ». La connexion est limitée à
5 tentatives par minute : en cas de doute, attendre une minute avant de réessayer.

## 2. Le tableau de bord

Il donne accès à quatre sections et à l'« Activité récente » (les vingt dernières
modifications, de la plus récente à la plus ancienne) :

- **La carte** : les plats, leurs descriptions, prix, catégories et ordre d'affichage.
- **La galerie** : les photographies, leurs légendes et leur ordre.
- **Les informations** : nom, téléphone, adresse, horaires, livraison et commande.
- **Le compte** : le mot de passe et la déconnexion.

Le lien « Voir la carte publique » ouvre le site tel que les visiteurs le voient.

## 3. La carte

- **Rechercher** un plat avec la barre de recherche du haut.
- **Modifier** un plat (nom, description, prix en DA, catégorie, « Visible sur la
  carte ») puis « Enregistrer ». Vérifiez sur `/menu` : c'est déjà publié.
- **Réordonner** un plat ou une catégorie avec les flèches ▴ ▾ (puis « Enregistrer
  l'ordre des catégories » pour les catégories).
- **Ajouter un plat** ou **ajouter une catégorie** : le champ « Nom » est obligatoire
  (« Les accents sont autorisés. »).
- **Supprimer une catégorie** : uniquement si elle est vide (« Une catégorie qui
  contient des plats ne peut pas être supprimée. Masquez-la, ou retirez les plats. »).
- **Photo d'un plat** : « Remplacer l'image (JPEG, PNG ou WebP, 2 Mo max.) » puis
  « Téléverser ». « Supprimer la photo » demande une confirmation ; sur un plat dont
  l'espèce est illustrée, le plat réaffiche son « illustration de poisson ».
- **« Mettre en avant »** : le plat apparaît en premier sur la page d'accueil (le bouton
  devient « Mis en avant »).

## 4. La galerie

- Modifier la **légende / description** d'une photo, masquer / afficher une photo
  (« Visible »), et réordonner avec « Enregistrer l'ordre ».
- « Ajouter une photographie » pour téléverser une nouvelle image.
- Les photographies fournies ne peuvent pas être supprimées ; une photo téléversée
  supprimée est **effacée définitivement**.

## 5. Les informations

- Chaque champ est une phrase que le site dit publiquement : « Nom du restaurant »,
  « Téléphone », « Adresse » (remplissez seulement si confirmée), « Lien vers Google
  Maps », « Horaires », les textes d'accueil, et la section « Livraison et commande »
  (« Zones de livraison », « Frais de livraison », « Commande minimum », « Heures de
  livraison »).
- **Laissez un champ vide plutôt que d'écrire un texte de remplacement** : un champ vide
  n'affiche rien, un texte inventé devient une information fausse.
- « Enregistrer » à la fin ; les changements sont immédiats sur le site.

## 6. Le compte et le mot de passe

- « Changer le mot de passe » demande le « Mot de passe actuel » puis le « Nouveau mot
  de passe ». Les autres sessions ouvertes seront fermées.
- Il n'existe pas de lien « mot de passe oublié » : le site n'envoie aucun e-mail. En cas
  d'oubli, il faudra passer par votre hébergeur. Ne perdez pas ce mot de passe.
- « Se déconnecter » pour fermer la session.

## 7. Vérifier une modification

1. Modifier dans le tableau de bord.
2. Ouvrir `https://<votre-domaine>` dans un autre onglet (ou utiliser « Voir la carte
   publique »).
3. Confirmer que la page affiche la nouvelle valeur.
4. Vérifier dans « Activité récente » que la modification a été enregistrée.

## 8. Ce que le site ne fait pas (aujourd'hui)

Pas de commande ni de paiement en ligne, pas de réservation en ligne, pas de livraison à
distance : tout passe par le téléphone affiché sur le site. Le contenu ne se prétend
jamais « mis à jour chaque jour » ; il affiche ce que vous avez enregistré.
# Guide du propriétaire

Ce document décrit ce que le tableau de bord permet de faire, dans l'ordre où vous en aurez
besoin. Les noms des boutons sont ceux affichés à l'écran.

## Se connecter

Rendez-vous sur la page de connexion, saisissez votre adresse e-mail et votre mot de passe, puis
cliquez sur **Se connecter**.

Il n'y a qu'un compte, et il n'y a pas de création de compte en ligne : personne d'autre ne peut
s'inscrire. Après cinq tentatives de connexion ratées en une minute, la page refuse de nouvelles
tentatives pendant une minute. Ce n'est pas un oubli, c'est une protection contre quelqu'un qui
essaierait des mots de passe.

> **Important** : il n'y a pas de « mot de passe oublié ». Aucun e-mail n'est envoyé par ce site.
> Si le mot de passe est perdu, il faut le réinitialiser depuis la console Cloudflare, ce qui
> suppose un accès technique. Faites une sauvegarde du mot de passe dans un gestionnaire de mots
> passe.

## Le tableau de bord

La page d'accueil du tableau de bord affiche quatre accès et, en dessous, les vingt dernières
modifications. Chaque ligne de cette activité indique ce qui a changé, la valeur précédente et la
nouvelle : `prixDa : 1200 → 1250`.

Les modifications sont en ligne immédiatement. Il n'y a pas de bouton « publier » : ce que vous
voyez dans le tableau de bord est ce qu'un visiteur voit sur le site.

## La carte

### Modifier un plat

Chaque plat a sa propre fiche. Les champs modifiables sont le nom, la description, le prix, la
catégorie et l'illustration de l'espèce.

- **Prix** : en dinars, sans virgule et sans décimale (`1250`, pas `1 250,00`). Le champ refuse
  les valeurs négatives, le zéro et les décimales.
- **Description** : facultative. Laissez-la vide pour n'afficher que le nom et le prix.
- **Illustration de l'espèce** : remplace la photo sur la carte et sur la page des poissons.
  « Aucune illustration » est un choix valide.

Cliquez sur **Enregistrer**. Le message vert confirme que la modification est en ligne.

### Masquer un plat ou une catégorie

Décochez **Visible sur la carte** pour un plat, **Visible sur le site** pour une catégorie. La ligne
disparaît du site mais reste dans le tableau de bord, avec la mention « masqué » (ou « masquée »).
Pour la remettre, cochez la case.

C'est la seule manière de retirer quelque chose de la carte. Un plat ne se supprime jamais : ce
tableau de bord ne contient aucune suppression de plat, parce que ce qui était au menu hier vaut
mieux conservé que perdu.

### Supprimer définitivement

Deux choses seulement se suppriment : une catégorie vide et une photographie que vous avez
téléversée.

Le bouton **Supprimer la catégorie** demande une confirmation, parce qu'il n'y a aucune
annulation. Il n'est utilisable que si la catégorie ne contient plus aucun plat, masqués compris :
les plats ne peuvent pas être supprimés, alors déplacez-les d'abord dans une autre catégorie —
ou laissez la catégorie en place et masquez-la, ce qui retire la catégorie de la carte sans rien
détruire.

### L'ordre d'affichage

Deux ordres, deux façons d'enregistrer.

**Les plats** se déplacent dans leur catégorie avec les flèches ↑ et ↓, et chaque flèche enregistre
aussitôt : la ligne se place à sa nouvelle place, sur le site comme ici.

**Les catégories** se déplacent avec leurs propres flèches, puis le bouton **Enregistrer l'ordre
des catégories** enregistre la liste complète. Une catégorie ne bouge nulle part avant que ce
bouton ne soit cliqué.

Pendant une recherche, les flèches des plats disparaissent et le formulaire **Ajouter un plat** se
masque aussi : un ordre partiel ne peut pas être envoyé, car il effacerait les plats qui ne sont
pas à l'écran. Les flèches des catégories, elles, restent, parce que l'ordre complet des catégories
est envoyé quel que soit le filtre.

### Ajouter un plat ou une catégorie

Le formulaire **Ajouter un plat** se trouve en bas de chaque catégorie. **Ajouter une catégorie**
est en bas de la page.

Un nom déjà utilisé n'est pas refusé : deux plats, ou deux catégories, peuvent porter le même
texte et rien ne les fusionne ni ne vous prévient de la ressemblance. Vérifiez ce que vous
saisissez.

## Les photos des plats

- **Remplacer l'image** : JPEG, PNG ou WebP, 2 Mo maximum, entre 100 et 6000 pixels de côté.
  Le nom du fichier et son type doivent correspondre à son contenu.
- **Supprimer la photo** : la photo disparaît du site. Si le plat a une illustration d'espèce, elle
  la remplace ; sinon le plat reste affiché en texte seul. Cette suppression est définitive.
- **Mettre en avant** : le plat passe en premier sur la page d'accueil. Utile pour le plat du jour.

## La galerie

Deux listes, deux origines.

**Les photographies du restaurant** sont celles qui sont déjà sur le site. Vous pouvez modifier
leur description (le texte lu par les lecteurs d'écran), leur légende, leur ordre, et les masquer.
Vous ne pouvez pas les supprimer : ce sont des fichiers du site, pas des téléversements.

**Les photographies ajoutées** sont celles que vous avez téléversées. Même réglages, et vous pouvez
aussi les supprimer : le fichier est alors effacé du stockage.

Sur la page publique, seules les photographies visibles apparaissent, dans l'ordre défini ici.

## Les informations

Nom du restaurant, téléphone, adresse, horaires, livraison, commande et lien vers la carte.

Ces informations apparaissent sur la page de contact et dans le pied de page du site. Les champs
laissés vides sont masqués plutôt que remplis : le site n'invente pas de texte.

## Le compte

- **Changer le mot de passe** : le mot de passe actuel est exigé, et le changement déconnecte
  toutes les autres sessions ouvertes. Si vous avez oublié le mot de passe actuel, ce formulaire ne
  peut rien pour vous.
- **Se déconnecter** : termine la session sur cet appareil.

## Conseils d'utilisation

- **Un seul onglet à la fois.** Si une page a été ouverte avant une modification faite ailleurs,
  vous verrez « Cet élément a été modifié entre-temps ». Rechargez la page : votre saisie n'a pas
  été perdue, mais elle n'a pas été appliquée. C'est prévu — c'est ce qui empêche deux personnes,
  ou deux onglets, d'écraser une modification sans s'en rendre compte.
- **Vérifiez la barre verte.** Tout message rouge signifie que rien n'a été enregistré.
- **Masquez plutôt que supprimez.** C'est réversible ; la suppression ne l'est pas.

## Ce que ce tableau de bord ne fait pas

Il n'y a pas de commande en ligne, de réservation, de paiement, de livraison affichée en direct ni
de disponibilité en temps réel. Ce sont des fonctions qui n'ont pas été construites, et le site ne
ne prétend pas les proposer.
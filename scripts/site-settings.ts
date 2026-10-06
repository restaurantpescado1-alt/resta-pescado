/**
 * The owner-confirmed site settings, in one place for both seeds.
 *
 * Every string is a confirmed fact and nothing more. `addressFr` is deliberately
 * `null`: the address was never confirmed, and `docs/CONTENT_POLICY.md` forbids
 * printing a guess. The site renders a map link instead, which needs no address.
 *
 * Shared by `scripts/seed-local.ts` (local development) and
 * `scripts/seed-remote.ts` (preview and production), so the two cannot drift
 * apart and a correction is made once.
 */
export const SEED_SETTINGS = {
  phoneFr: "0540559967",
  hoursFr: "Ouvert tous les jours ouvrables de 11h15 à 15h15. Fermé le vendredi.",
  mapsUrl: "https://maps.app.goo.gl/n3cMmMpeXeLDsQtY6",
  addressFr: null,
  familyNoteFr: "Restaurant familial. Une chaise haute est disponible pour les enfants.",
  heroTitleFr: "Poissons et fruits de mer, préparés à Alger.",
  heroSubtitleFr:
    "Consultez notre carte et appelez-nous pour commander, réserver une table ou demander une livraison.",
} as const;

/**
 * Owner-confirmed delivery settings.
 *
 * Delivery is arranged and paid for by phone rather than online, so each field is
 * the owner's own statement. No zone list, no fee amount, and no opening hours
 * are invented, because the content policy rules out stating anything the owner
 * has not confirmed.
 */
export const SEED_DELIVERY = {
  enabled: true,
  zones:
    "La zone de livraison est confirmée par téléphone après avoir communiqué votre adresse.",
  fee: "Les frais de livraison sont communiqués par téléphone.",
  minimumOrder: "Il n'y a pas de commande minimum.",
  hours: "Les heures de livraison sont les mêmes que les heures d'ouverture du restaurant.",
  ordering: "Commande et livraison par téléphone au 0540559967. La livraison est payante.",
} as const;

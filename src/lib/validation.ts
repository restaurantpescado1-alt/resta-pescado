import { z } from "zod";

/**
 * Dish price in Algerian dinar.
 *
 * Whole units only: a dish has no centimes, and a float column would invite
 * rounding drift. `1` is the floor because a free dish is not sellable, and the
 * ceiling keeps a fat-fingered `99999999` out of the database.
 */
export const MIN_PRICE_DA = 1;
export const MAX_PRICE_DA = 100_000;

export const priceDaSchema = z
  .number()
  .int("Le prix doit être un nombre entier de dinars.")
  .positive("Le prix doit être supérieur à zéro.")
  .max(MAX_PRICE_DA, `Le prix ne peut pas dépasser ${MAX_PRICE_DA} DA.`);

export const updatePriceInputSchema = z.object({
  menuItemId: z.string().min(1, "Identifiant de plat manquant."),
  priceDa: priceDaSchema,
});

export type UpdatePriceInput = z.infer<typeof updatePriceInputSchema>;

/** R2 object keys are `menu/{year}/{uuid}.{ext}` per docs/ARCHITECTURE.md. */
export const R2_KEY_PATTERN = /^menu\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const imageKeySchema = z.string().regex(R2_KEY_PATTERN, "Clé d'image invalide.");

export const replaceImageInputSchema = z.object({
  menuItemId: z.string().min(1, "Identifiant de plat manquant."),
  imageKey: imageKeySchema,
});

export type ReplaceImageInput = z.infer<typeof replaceImageInputSchema>;

import { z } from "zod";

import { FISH_REFERENCE_ORDER } from "./fish-images";

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

/**
 * Toggling whether the owner recommends a dish.
 *
 * The value is a real boolean in the schema rather than an optional field, so a form
 * that forgets to send it is rejected instead of silently clearing the flag.
 */
export const updateFeaturedInputSchema = z.object({
  menuItemId: z.string().min(1, "Identifiant de plat manquant."),
  isFeatured: z.boolean(),
});

export type UpdateFeaturedInput = z.infer<typeof updateFeaturedInputSchema>;

/** Image keys are `menu/{year}/{uuid}.{ext}` per docs/ARCHITECTURE.md. */
export const IMAGE_KEY_PATTERN = /^menu\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const imageKeySchema = z.string().regex(IMAGE_KEY_PATTERN, "Clé d'image invalide.");

export const replaceImageInputSchema = z.object({
  menuItemId: z.string().min(1, "Identifiant de plat manquant."),
  imageKey: imageKeySchema,
});

export type ReplaceImageInput = z.infer<typeof replaceImageInputSchema>;

/* ------------------------------------------------------------------ shared */

/**
 * Revision the owner was looking at when they filled the form in.
 *
 * Sent by every Phase 3 write and required by all of them. A form without it could not tell
 * a fresh edit from one that would overwrite somebody else's work, which is the one thing
 * `owner.ts` is built to prevent.
 *
 * Kept separate from the schemas that use it because the message belongs to the guard rather
 * than to any one form, and duplicating it per action would let the wording drift.
 */
export const expectedVersionSchema = z.coerce
  .number({ error: "Version manquante." })
  .int("Version invalide.")
  .positive("Version invalide.")
  .max(1_000_000, "Version invalide.");

/**
 * Turns a submitted text field into a string or `null`.
 *
 * A form sends `""` for a field the owner left blank, and the columns these values reach are
 * nullable to mean "the owner has not written this". Storing the empty string instead would
 * make "not written" and "written as nothing" indistinguishable, which matters most for
 * `descriptionFr` and `captionFr`: `docs/CONTENT_POLICY.md` forbids inventing menu copy, so
 * blank has to stay blank rather than becoming a description that reads as content.
 *
 * Whitespace is trimmed first, so a field containing only spaces is blank rather than text
 * the owner cannot see.
 *
 * A field the form did not send at all arrives as `null` and is accepted by the `.nullable()`.
 * It is *not* caught: a `.catch(null)` here would also swallow the length failure, and the
 * result would be a description that vanishes because it was too long, with no message and no
 * trace of the text the owner typed. Rejecting it keeps the form open with the error shown.
 */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} ne peut pas dépasser ${max} caractères.`)
    .transform((value) => value.trim())
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/**
 * Text the owner must have filled in.
 *
 * Rejects whitespace-only input rather than trimming it into an empty string, because a
 * category or a dish with no name is not something the public pages can render.
 */
export const requiredText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} est obligatoire.`)
    .max(max, `${label} ne peut pas dépasser ${max} caractères.`);

/**
 * A boolean the owner toggled.
 *
 * A real boolean rather than an optional field, so a form that forgets to send it is
 * rejected instead of quietly clearing the flag it meant to set.
 */
const ownerBoolean = z.boolean();

/* ------------------------------------------------------------------ dishes */

/** Long enough for a dish name and a description, short enough to render in a list. */
const MAX_DISH_NAME = 120;
const MAX_DISH_DESCRIPTION = 600;

/**
 * Species illustrations, taken from the manifest rather than listed again here.
 *
 * The slugs come from `FISH_REFERENCE_ORDER` so this cannot drift out of step with
 * `fish-images.ts`. A copy of the list would be one more place to update when a fish is added,
 * and the failure would be quiet and in the wrong direction: a dish the owner was allowed to
 * save would be refused because the validator had never heard of the new illustration.
 */
export const fishReferenceSlugSchema = z
  .enum(FISH_REFERENCE_ORDER, { error: "Espèce de poisson inconnue." })
  .nullable();

/**
 * Creating a dish.
 *
 * Everything here is something the owner typed, and nothing defaults to a value they did
 * not choose. A dish is created visible and unfeatured: hidden would mean creating something
 * invisible on purpose, and featured would mean claiming the restaurant recommends a dish the
 * owner has not chosen.
 */
export const createMenuItemInputSchema = z.object({
  categoryId: z.string().min(1, "Choisissez une catégorie."),
  nameFr: requiredText(MAX_DISH_NAME, "Le nom du plat"),
  descriptionFr: optionalText(MAX_DISH_DESCRIPTION, "La description"),
  priceDa: priceDaSchema,
  fishReferenceSlug: fishReferenceSlugSchema,
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemInputSchema>;

/**
 * Saving a dish's editable details.
 *
 * Carries the whole dish rather than only the fields that changed, because the repository
 * replaces every field in one statement. Two forms therefore cannot leave a row holding a
 * mixture of both.
 */
export const updateMenuItemDetailsInputSchema = z.object({
  menuItemId: z.string().min(1, "Identifiant de plat manquant."),
  expectedVersion: expectedVersionSchema,
  categoryId: z.string().min(1, "Choisissez une catégorie."),
  nameFr: requiredText(MAX_DISH_NAME, "Le nom du plat"),
  descriptionFr: optionalText(MAX_DISH_DESCRIPTION, "La description"),
  priceDa: priceDaSchema,
  fishReferenceSlug: fishReferenceSlugSchema,
});

export type UpdateMenuItemDetailsInput = z.infer<typeof updateMenuItemDetailsInputSchema>;

export const setMenuItemVisibilityInputSchema = z.object({
  menuItemId: z.string().min(1, "Identifiant de plat manquant."),
  expectedVersion: expectedVersionSchema,
  isVisible: ownerBoolean,
});

export type SetMenuItemVisibilityInput = z.infer<typeof setMenuItemVisibilityInputSchema>;

/* ------------------------------------------------------------------ categories */

const MAX_CATEGORY_NAME = 80;

export const createCategoryInputSchema = z.object({
  nameFr: requiredText(MAX_CATEGORY_NAME, "Le nom de la catégorie"),
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const renameCategoryInputSchema = z.object({
  categoryId: z.string().min(1, "Identifiant de catégorie manquant."),
  expectedVersion: expectedVersionSchema,
  nameFr: requiredText(MAX_CATEGORY_NAME, "Le nom de la catégorie"),
});

export type RenameCategoryInput = z.infer<typeof renameCategoryInputSchema>;

export const setCategoryVisibilityInputSchema = z.object({
  categoryId: z.string().min(1, "Identifiant de catégorie manquant."),
  expectedVersion: expectedVersionSchema,
  isVisible: ownerBoolean,
});

export type SetCategoryVisibilityInput = z.infer<typeof setCategoryVisibilityInputSchema>;

export const deleteCategoryInputSchema = z.object({
  categoryId: z.string().min(1, "Identifiant de catégorie manquant."),
  expectedVersion: expectedVersionSchema,
});

export type DeleteCategoryInput = z.infer<typeof deleteCategoryInputSchema>;

/**
 * A new order for a whole list.
 *
 * Bounded above so a malformed or hostile payload cannot turn into a SQL fragment with
 * thousands of `WHEN` branches. A menu has tens of dishes and a gallery has tens of
 * photographs; the ceiling is generous rather than tight so it cannot reject a real menu.
 *
 * Duplicates are rejected here as well as in the repository, because a duplicate id is a
 * client bug worth a clear message rather than a row-count mismatch.
 */
function idList(min: number, max: number, label: string) {
  return z
    .array(z.string().min(1, `${label} manquant.`))
    .min(min, `Choisissez au moins ${min} élément(s).`)
    .max(max, `La liste ne peut pas dépasser ${max} éléments.`)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Un élément apparaît deux fois dans la liste.",
    });
}

export const MAX_ORDERABLE_ITEMS = 400;

export const reorderMenuItemsInputSchema = z.object({
  categoryId: z.string().min(1, "Identifiant de catégorie manquant."),
  itemIds: idList(1, MAX_ORDERABLE_ITEMS, "Identifiant de plat"),
});

export type ReorderMenuItemsInput = z.infer<typeof reorderMenuItemsInputSchema>;

export const reorderCategoriesInputSchema = z.object({
  categoryIds: idList(1, 100, "Identifiant de catégorie"),
});

export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesInputSchema>;

/* ------------------------------------------------------------------ settings */

const MAX_PHONE = 40;
const MAX_SHORT_TEXT = 200;
const MAX_URL = 500;

/**
 * Optional lines of owner copy.
 *
 * Every one of these is free text the owner writes, so the only rules are a length and the
 * blank-means-blank rule. `docs/CONTENT_POLICY.md` forbids filling any of them with a guess,
 * and nothing here supplies a default.
 */
const optionalLine = (max: number, label: string) => optionalText(max, label);

/**
 * A web address the owner pasted.
 *
 * Only `http` and `https` are accepted. A `javascript:` or `data:` URL here would end up in
 * an `href` on the public site, so the scheme is checked rather than assumed.
 */
const ownerUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(MAX_URL, `${label} ne peut pas dépasser ${MAX_URL} caractères.`)
    .refine((value) => value.length === 0 || /^https?:\/\/[^\s]+$/iu.test(value), {
      message: `${label} doit commencer par http:// ou https://.`,
    })
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/**
 * The restaurant's phone number.
 *
 * Checked only for length and shape: digits, spaces, dots, dashes and a leading `+`. A
 * stricter rule would reject valid Algerian formats, and the field is rendered as plain text
 * rather than as a `tel:` link unless it is one the site already knows how to build.
 */
const ownerPhone = z
  .string()
  .trim()
  .max(MAX_PHONE, `Le numéro ne peut pas dépasser ${MAX_PHONE} caractères.`)
  .refine((value) => value.length === 0 || /^\+?[\d\s.-]+$/u.test(value), {
    message: "Le numéro ne peut contenir que des chiffres, des espaces, des points et des tirets.",
  })
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const siteSettingsInputSchema = z.object({
  expectedVersion: expectedVersionSchema,
  restaurantNameFr: requiredText(MAX_CATEGORY_NAME, "Le nom du restaurant"),
  phoneFr: ownerPhone,
  addressFr: optionalLine(MAX_SHORT_TEXT, "L'adresse"),
  mapsUrl: ownerUrl("Le lien Maps"),
  hoursFr: optionalLine(MAX_SHORT_TEXT, "Les horaires"),
  familyNoteFr: optionalLine(MAX_SHORT_TEXT, "La note sur la famille"),
  heroTitleFr: optionalLine(MAX_SHORT_TEXT, "Le titre d'accueil"),
  heroSubtitleFr: optionalLine(MAX_SHORT_TEXT, "Le sous-titre d'accueil"),
  deliveryEnabled: ownerBoolean,
  deliveryZonesTextFr: optionalLine(MAX_SHORT_TEXT, "La zone de livraison"),
  deliveryFeeTextFr: optionalLine(MAX_SHORT_TEXT, "Les frais de livraison"),
  deliveryMinimumOrderTextFr: optionalLine(MAX_SHORT_TEXT, "La commande minimum"),
  deliveryHoursFr: optionalLine(MAX_SHORT_TEXT, "Les heures de livraison"),
  pickupTextFr: optionalLine(MAX_SHORT_TEXT, "La commande"),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsInputSchema>;

/* ------------------------------------------------------------------ gallery */

const MAX_ALT_TEXT = 200;
const MAX_CAPTION = 300;

/**
 * Alt text for a photograph.
 *
 * Required and non-blank, because an image with no description is unusable to a
 * screen-reader user. This is the one place in the dashboard that refuses to accept silence,
 * and the reason is accessibility rather than bookkeeping.
 */
const ownerAltText = z
  .string()
  .trim()
  .min(1, "La description de l'image est obligatoire.")
  .max(MAX_ALT_TEXT, `La description ne peut pas dépasser ${MAX_ALT_TEXT} caractères.`);

export const updateBundledImageInputSchema = z.object({
  slug: z.string().min(1, "Photographie introuvable."),
  expectedVersion: expectedVersionSchema,
  altTextFr: ownerAltText,
  captionFr: optionalText(MAX_CAPTION, "La légende"),
  isVisible: ownerBoolean,
});

export type UpdateBundledImageInput = z.infer<typeof updateBundledImageInputSchema>;

export const updateGalleryImageInputSchema = z.object({
  galleryImageId: z.string().min(1, "Photographie introuvable."),
  expectedVersion: expectedVersionSchema,
  altTextFr: ownerAltText,
  captionFr: optionalText(MAX_CAPTION, "La légende"),
  isVisible: ownerBoolean,
});

export type UpdateGalleryImageInput = z.infer<typeof updateGalleryImageInputSchema>;

export const deleteGalleryImageInputSchema = z.object({
  galleryImageId: z.string().min(1, "Photographie introuvable."),
  expectedVersion: expectedVersionSchema,
});

export type DeleteGalleryImageInput = z.infer<typeof deleteGalleryImageInputSchema>;

/**
 * Uploading a gallery photograph.
 *
 * The file itself is validated by `validateImageUpload`, which reads the bytes rather than
 * trusting the declared type. Only the accompanying text is checked here.
 */
export const uploadGalleryImageInputSchema = z.object({
  altTextFr: ownerAltText,
  captionFr: optionalText(MAX_CAPTION, "La légende"),
});

export type UploadGalleryImageInput = z.infer<typeof uploadGalleryImageInputSchema>;

export const reorderBundledGalleryInputSchema = z.object({
  slugs: idList(1, MAX_ORDERABLE_ITEMS, "Photographie"),
});

export type ReorderBundledGalleryInput = z.infer<typeof reorderBundledGalleryInputSchema>;

export const reorderGalleryImagesInputSchema = z.object({
  galleryImageIds: idList(1, MAX_ORDERABLE_ITEMS, "Photographie"),
});

export type ReorderGalleryImagesInput = z.infer<typeof reorderGalleryImagesInputSchema>;

/* ------------------------------------------------------------------ account */

/**
 * Password change.
 *
 * The bounds are Better Auth's, restated here so the owner gets a French message before the
 * library's English one. The current password is required because Better Auth verifies it:
 * without it, anyone who reached an unlocked session could take the account over.
 *
 * Neither password is ever logged, echoed back, or stored outside Better Auth's own hash.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const changePasswordInputSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Saisissez votre mot de passe actuel.")
    .max(MAX_PASSWORD_LENGTH, `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
    .max(MAX_PASSWORD_LENGTH, `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`)
    .refine((value) => value.trim().length === value.length, {
      message: "Le mot de passe ne peut pas commencer ni finir par une espace.",
    }),
});

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

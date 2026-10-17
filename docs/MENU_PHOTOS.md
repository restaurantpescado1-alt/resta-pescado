# Menu Photos

How the 37 illustrative dish pictures on `/menu` are produced, mapped, and disclosed.

## What these images are

Every file in `public/images/menu/` is an **AI-generated illustrative picture of a dish
or a drink**. None of them is a photograph of what the restaurant actually serves.
`docs/CONTENT_POLICY.md` ranks them fifth — above no image, below a real photograph —
so every surface that shows one also shows `MENU_PHOTO_EXPLANATION_FR`:

> Photos illustratives générées par IA. Présentation et portions variables.

The sentence appears **once per page**, not as a badge under each of the thirty-seven
rows. A per-card badge would bury the menu in boilerplate; one sentence above the list
carries the same disclosure without competing with the food.

The alt text on each image names the dish and says it was generated, so a screen-reader
user gets the same assurance a sighted reader gets from the page-level sentence.

## Where they sit in the image order

A menu row resolves its picture through three tiers, highest first:

1. **`menu_items.image_key`** — a photograph the owner uploaded from the dashboard,
   served through `/api/media`. It always wins, because a photograph a person chose
   beats any generated picture.
2. **The bundled photo declared in `src/lib/dish-images.ts`**, keyed by the stable item
   id, served straight from `public/images/menu/`. This is what makes all thirty-seven
   rows look the same.
3. **`menu_items.fish_reference_slug`** — the bundled fish *species* illustration, which
   answers "which fish is this" and can never stand in for a picture of a plate. It is
   now the last resort on a menu row.

Tier 2 is deliberately **not** stored in the database. It is a static fallback in
`public/`, exactly like the category covers and the gallery photographs, so the owner
can still override any single dish from the dashboard without a deployment, and
removing a bundled photo needs no migration and no reseed. Deleting the files and
reverting the commit restores the previous behaviour in full.

The fish guide keeps its own illustrations and its own sentence on the pages that teach
species (`/` and `/a-propos`); nothing here replaces them there.

## How the derivatives are produced

`scripts/process-menu-photos.ts` reads the read-only masters in
`RESTA PESCADO ASSETS\menu-photos\originals` and writes WebP derivatives into
`public/images/menu/`. It is idempotent: re-running it overwrites the derivatives with
the same output.

```bash
npm run images:menu -- --source "RESTA PESCADO ASSETS\menu-photos\originals"
```

The script validates before it writes:

- every approved item id has a source file (checked against `allApprovedItems()`);
- every source file maps to exactly one approved item;
- no source file is mapped to two dishes;
- every master exists on disk.

A failed validation aborts the run without writing anything.

### Geometry

| | |
|---|---|
| Target size | **720 × 540** (exactly 4:3) |
| Format | WebP, `sharp` quality **82**, `fit: "cover"`, centre crop |
| Rendered box | at most 192 CSS px wide (`md:w-48`), so 720px covers a 3× screen |

The masters are 1448 × 1086 (one is 1447 × 1087). Serving them as a 192px thumbnail
would ship roughly 56× the pixels the page can display. The row's image box is sized to
exactly 4:3 at every breakpoint so `object-cover` crops the same sliver on all
thirty-seven rows.

### Duplicate detection

The script hashes every master with SHA-256 and reports any two files that are
byte-identical. It also samples luminance spread to catch blank or near-blank output.

## Source-to-derivative mapping

The authoritative mapping lives in the `SOURCE_FILE_BY_ITEM_ID` table inside
`scripts/process-menu-photos.ts` and in `BUNDLED_DISH_PHOTOS` inside
`src/lib/dish-images.ts`. The unit suite (`tests/unit/dish-images.test.ts`) checks the
two agree with each other, with the approved menu, and with the files on disk.

Two selections are deliberate rather than by taking the newest file:

| Item | Source file | Note |
|---|---|---|
| `item-canette` | `canette-v2.png` | v2 rather than the superseded generic silver can |
| `item-crevettes-en-sauce` | `crevettes-en-sauce-v2.png` | v2 rather than the superseded first attempt |

Four source files use the literal title with a typographic apostrophe (U+2019):
`Salade d’Aubergines.png`, `Salade de Tomate.png`, `Salade de Poulpe.png`,
`Sepia en Sauce.png`. The table uses the exact filenames, punctuation included; the
build script does no name normalisation.

## Known issues for the owner

### 1. `bourek-crevettes` and `bourek-thon` share one picture

The two source masters, `bourek-crevettes.png` and `bourek-thon.png`, are
**byte-identical** (same SHA-256). Both files ship so the menu is 37/37, but a visitor
will see the same picture on two different dishes. This is a **production blocker**:
one of the two needs to be regenerated before the site goes live with photos.

### 2. Brands depicted in the drinks

`canette-v2.png` depicts a recognisable beverage brand. The restaurant has not
confirmed which brands it stocks, so nothing anywhere else on the site may make a
brand-availability claim. The owner should confirm whether the depicted brand is one
they actually serve, and replace the image if it is not.

### 3. One master is not exactly 4:3

`salade-pomme-de-terre.png` is 1447 × 1087 rather than 1448 × 1086. The centre crop
trims roughly one pixel; the derivative is still 720 × 540.

## Owner upload is unaffected

Uploading a photograph from the dashboard still overrides the bundled photo on that
dish, exactly as it overrode the fish illustration before. Clearing the upload drops
the dish back down the list — to the bundled photo, then to the species illustration,
then to a text row. The dashboard states this consequence before the owner confirms a
removal, so clearing an upload never looks like a failed deletion.

## What is not claimed

- These are not photographs of the restaurant's food.
- Nothing about the contents of these pictures — ingredients, portions, brands,
  presentation — has been confirmed by the restaurant.
- They are not uploaded to Google Business Profile or any third party.
- They do not replace the category covers, the gallery photographs, or the fish guide
  illustrations.

## Regenerating

To rebuild the derivatives from the masters:

```bash
npm run images:menu
```

To re-check the manifest against the approved menu, the disk, and the geometry without
regenerating anything:

```bash
npx vitest run tests/unit/dish-images.test.ts tests/unit/image-manifests.test.ts
```

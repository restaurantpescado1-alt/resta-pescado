"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSettingsAction } from "@/app/admin/owner-actions";
import type { SiteSettingsRow } from "@/db/schema";
import { ActionMessage, Field, SubmitButton, ToggleField, inputClass } from "@/components/admin/form-parts";
import type { ActionResult } from "@/lib/action-result";

/**
 * The restaurant's own information.
 *
 * One form for every field, saving the whole row at once, because the row is edited as a whole:
 * the public pages read it as a single unit, and a settings page that could fail halfway
 * through would leave the site describing a restaurant that exists nowhere.
 *
 * Every field is prefilled from the stored row and every field is sent back, including the
 * blank ones. A form that only sent what changed could never clear a field, and clearing one
 * has to be possible: the address is deliberately empty until the owner confirms it.
 *
 * Nothing here is prefilled with a suggestion. `docs/CONTENT_POLICY.md` forbids inventing copy
 * about the restaurant, so a blank field stays blank and the form says so.
 */
export function SettingsForm({ settings }: { settings: SiteSettingsRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);

  /*
   * `expectedVersion` travels with the form. Without it a save from an old tab would overwrite
   * a newer one silently; with it the server refuses and the owner is told to reload.
   */
  const [expectedVersion, setExpectedVersion] = useState(settings.version);

  const [draft, setDraft] = useState(() => ({
    restaurantNameFr: settings.restaurantNameFr,
    phoneFr: settings.phoneFr ?? "",
    addressFr: settings.addressFr ?? "",
    mapsUrl: settings.mapsUrl ?? "",
    hoursFr: settings.hoursFr ?? "",
    familyNoteFr: settings.familyNoteFr ?? "",
    heroTitleFr: settings.heroTitleFr ?? "",
    heroSubtitleFr: settings.heroSubtitleFr ?? "",
    deliveryEnabled: settings.deliveryEnabled,
    deliveryZonesTextFr: settings.deliveryZonesTextFr ?? "",
    deliveryFeeTextFr: settings.deliveryFeeTextFr ?? "",
    deliveryMinimumOrderTextFr: settings.deliveryMinimumOrderTextFr ?? "",
    deliveryHoursFr: settings.deliveryHoursFr ?? "",
    pickupTextFr: settings.pickupTextFr ?? "",
  }));

  function set<K extends keyof typeof draft>(field: K, value: (typeof draft)[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await saveSettingsAction({ expectedVersion, ...draft });
      setMessage(result);
      if (result.ok) {
        /*
         * The row has moved to version n+1. Adopting it here means the next save from the same
         * open form is guarded against the state the database is actually in, instead of
         * needing a reload before the owner can correct a typo they just made.
         */
        setExpectedVersion((previous) => previous + 1);
        router.refresh();
      } else if (result.stale) {
        // Nothing was written, and a retry would fail the same way: the page has to be re-read.
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-8" data-testid="settings-form">
      <ActionGroup
        title="Identité"
        description="Le nom et le numéro qui apparaissent sur le site et sur les pages de contact."
      >
        <Field label="Nom du restaurant" htmlFor="restaurantNameFr">
          <input
            id="restaurantNameFr"
            name="restaurantNameFr"
            required
            value={draft.restaurantNameFr}
            onChange={(event) => set("restaurantNameFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="Téléphone"
          htmlFor="phoneFr"
          hint="Laissez vide si vous ne voulez pas publier de numéro."
        >
          <input
            id="phoneFr"
            name="phoneFr"
            type="tel"
            inputMode="tel"
            value={draft.phoneFr}
            onChange={(event) => set("phoneFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="Adresse"
          htmlFor="addressFr"
          hint="Aucune adresse n'est publiée tant que vous ne l'écrivez pas ici."
        >
          <input
            id="addressFr"
            name="addressFr"
            value={draft.addressFr}
            onChange={(event) => set("addressFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="Lien vers Google Maps"
          htmlFor="mapsUrl"
          hint="Doit commencer par http:// ou https://. Laissez vide pour ne pas afficher de bouton."
        >
          <input
            id="mapsUrl"
            name="mapsUrl"
            type="url"
            inputMode="url"
            value={draft.mapsUrl}
            onChange={(event) => set("mapsUrl", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Horaires" htmlFor="hoursFr" hint="Texte libre, tel qu'il apparaît sur le site.">
          <textarea
            id="hoursFr"
            name="hoursFr"
            rows={3}
            value={draft.hoursFr}
            onChange={(event) => set("hoursFr", event.target.value)}
            className={inputClass}
          />
        </Field>
      </ActionGroup>

      <ActionGroup
        title="Textes d'accueil"
        description="Ce qui apparaît en haut de la page d'accueil. Laissez vide pour n'afficher aucun texte."
      >
        <Field label="Titre d'accueil" htmlFor="heroTitleFr">
          <input
            id="heroTitleFr"
            name="heroTitleFr"
            value={draft.heroTitleFr}
            onChange={(event) => set("heroTitleFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Sous-titre d'accueil" htmlFor="heroSubtitleFr">
          <input
            id="heroSubtitleFr"
            name="heroSubtitleFr"
            value={draft.heroSubtitleFr}
            onChange={(event) => set("heroSubtitleFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="Note sur la famille"
          htmlFor="familyNoteFr"
          hint="Une phrase sur les enfants et les chaises, si vous souhaitez le mentionner."
        >
          <input
            id="familyNoteFr"
            name="familyNoteFr"
            value={draft.familyNoteFr}
            onChange={(event) => set("familyNoteFr", event.target.value)}
            className={inputClass}
          />
        </Field>
      </ActionGroup>

      <ActionGroup
        title="Livraison et commande"
        description="Ce que le site dit sur la façon de commander. Rien n'est ajouté automatiquement."
      >
        <ToggleField
          id="deliveryEnabled"
          label="Le site présente la livraison"
          hint="Décochez pour masquer toute la section, sans rien supprimer."
          checked={draft.deliveryEnabled}
          onChange={(checked) => set("deliveryEnabled", checked)}
        />

        <Field
          label="Zones de livraison"
          htmlFor="deliveryZonesTextFr"
          hint="Laisser vide si vous ne précisez pas les zones."
        >
          <input
            id="deliveryZonesTextFr"
            name="deliveryZonesTextFr"
            value={draft.deliveryZonesTextFr}
            onChange={(event) => set("deliveryZonesTextFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Frais de livraison" htmlFor="deliveryFeeTextFr">
          <input
            id="deliveryFeeTextFr"
            name="deliveryFeeTextFr"
            value={draft.deliveryFeeTextFr}
            onChange={(event) => set("deliveryFeeTextFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Commande minimum" htmlFor="deliveryMinimumOrderTextFr">
          <input
            id="deliveryMinimumOrderTextFr"
            name="deliveryMinimumOrderTextFr"
            value={draft.deliveryMinimumOrderTextFr}
            onChange={(event) => set("deliveryMinimumOrderTextFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Heures de livraison" htmlFor="deliveryHoursFr">
          <input
            id="deliveryHoursFr"
            name="deliveryHoursFr"
            value={draft.deliveryHoursFr}
            onChange={(event) => set("deliveryHoursFr", event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Commande" htmlFor="pickupTextFr" hint="Comment le client passe commande.">
          <input
            id="pickupTextFr"
            name="pickupTextFr"
            value={draft.pickupTextFr}
            onChange={(event) => set("pickupTextFr", event.target.value)}
            className={inputClass}
          />
        </Field>
      </ActionGroup>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
        <SubmitButton pending={isPending} testId="settings-save">
          Enregistrer
        </SubmitButton>
        <ActionMessage result={message} />
      </div>
    </form>
  );
}

/**
 * One titled block of fields.
 *
 * A visible legend rather than a bold paragraph, so the grouping is announced as a group
 * rather than read as another line of text.
 */
function ActionGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-lg font-semibold">{title}</legend>
      <p className="-mt-2 text-sm text-ink-soft">{description}</p>
      {children}
    </fieldset>
  );
}
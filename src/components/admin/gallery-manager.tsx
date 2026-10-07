"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteGalleryImageAction,
  reorderBundledGalleryAction,
  reorderGalleryAction,
  saveBundledImageAction,
  saveGalleryImageAction,
  uploadGalleryImageAction,
} from "@/app/admin/owner-actions";
import { ActionMessage, Field, SubmitButton, ToggleField, inputClass } from "@/components/admin/form-parts";
import { SafeImage } from "@/components/safe-image";
import type { GalleryImageRow } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { mediaUrl } from "@/lib/format";
import { bundledGalleryUrl, type MergedBundledGalleryImage } from "@/lib/gallery-images";
import { MAX_IMAGE_BYTES } from "@/lib/images";

/**
 * The gallery manager: the photographs the restaurant brought with the site, and the ones the
 * owner has added since.
 *
 * The two kinds are kept visibly apart because they are not the same thing. A bundled
 * photograph is a file in `public/`, so it cannot be deleted and can only be hidden; an upload
 * lives in the media store behind the media route and can be removed. One editable list with one set of
 * controls would either offer a delete that cannot work, or hide the one that should.
 *
 * Ordering is by "move up"/"move down" buttons held in local state and saved as a whole list.
 * Drag and drop would be quicker on a desktop and worse everywhere else: imprecise on a phone,
 * with no keyboard equivalent unless a full set of key handlers is added by hand, and a failure
 * that is silent rather than an error. Two buttons plus one save are always operable, and the
 * save is a single whole-order write that cannot half-apply.
 */
export function GalleryManager({
  bundled: initialBundled,
  uploaded: initialUploaded,
}: {
  bundled: readonly MergedBundledGalleryImage[];
  uploaded: readonly GalleryImageRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);

  /*
   * The order is held locally rather than saved on every tap.
   *
   * Saving on each move would bump the version of every photograph in the list on every tap,
   * which on a phone means a write per mis-tap, and each of those would make the row the owner
   * was about to edit look stale to them. One save for the whole order, instead.
   *
   * Ids, not rows. `run()` re-reads the page after every write and the rows are rendered from
   * that re-read, so an upload appears as soon as it lands and a deleted photograph leaves,
   * while the moves below stay local until they are saved. Holding the rows here instead would
   * freeze the lists at the state they were seeded with: `router.refresh()` hands down new
   * props and deliberately keeps client state.
   */
  const [bundledSlugs, setBundledSlugs] = useState(() => initialBundled.map((image) => image.slug));
  const [uploadedIds, setUploadedIds] = useState(() => initialUploaded.map((image) => image.id));
  const bundled = order(bundledSlugs, initialBundled, (image) => image.slug);
  const uploaded = order(uploadedIds, initialUploaded, (image) => image.id);

  /*
   * Bumped on a successful upload so the file input empties itself.
   *
   * Without it the input keeps the file it just uploaded, and the browser refuses to select the
   * same file again — which is exactly what an owner does when the first photograph was the
   * wrong one. A token is used rather than a direct `reset()` because the success is known after
   * the action returns, by which point the submit handler's event object is gone; that is the
   * same trap that broke the dish photograph upload, documented there.
   */
  const [uploadToken, setUploadToken] = useState(0);

  /** Runs a write, then the two things every write here needs: a message and a re-read. */
  function run(write: () => Promise<ActionResult>, onSuccess?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await write();
      setMessage(result);
      if (result.ok || result.stale) {
        // `stale` included: nothing was written, and the page has to be re-read either way.
        router.refresh();
      }
      if (result.ok) {
        onSuccess?.();
      }
    });
  }

  return (
    <div className="mt-8 space-y-12" data-testid="gallery-manager">
      <section>
        <SectionHeading
          title="Photographies du restaurant"
          count={bundled.length}
          description="Ces fichiers sont livrés avec le site. Vous pouvez changer leur description et leur ordre, et masquer ceux que vous ne voulez pas montrer. Ils ne peuvent pas être supprimés."
        />

        {bundled.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Aucune photographie.</p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {bundled.map((image, index) => (
                <li key={image.slug} data-testid={`bundled-${image.slug}`}>
                  <BundledRow
                    image={image}
                    isPending={isPending}
                    onSave={(payload) => run(() => saveBundledImageAction(payload))}
                  />
                  <MoveButtons
                    label={image.altTextFr}
                    index={index}
                    total={bundled.length}
                    disabled={isPending}
                    onMove={(direction) =>
                      setBundledSlugs(move(bundled, index, direction).map((moved) => moved.slug))
                    }
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button
                type="button"
                disabled={isPending}
                data-testid="bundled-order-save"
                onClick={() => run(() => reorderBundledGalleryAction({ slugs: bundled.map((i) => i.slug) }))}
                className="rounded border border-line-strong px-3 py-2 text-sm font-semibold text-marine transition-colors hover:bg-sand disabled:opacity-60"
              >
                Enregistrer l&apos;ordre
              </button>
              <p className="text-xs text-ink-soft">Les modifications de texte sont enregistrées séparément.</p>
            </div>
          </>
        )}
      </section>

      <section>
        <SectionHeading
          title="Photographies ajoutées"
          count={uploaded.length}
          description="Vos propres photos. Elles sont visibles sur la page galerie et peuvent être supprimées."
        />

        {uploaded.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft" data-testid="uploads-empty">
            Vous n&apos;avez pas encore ajouté de photographie.
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {uploaded.map((image, index) => (
                <li key={image.id} data-testid={`uploaded-${image.id}`}>
                  <UploadedRow
                    image={image}
                    isPending={isPending}
                    onSave={(payload) => run(() => saveGalleryImageAction(payload))}
                    onDelete={() => {
                      /*
                       * The one destructive control in this dashboard with no undo, so it asks
                       * first. The browser's own dialog is deliberate: it works with a keyboard
                       * and a screen reader with no focus management of our own, and it cannot
                       * be styled into looking harmless.
                       */
                      if (!window.confirm("Supprimer définitivement cette photographie ? Cette action est irréversible.")) {
                        return;
                      }
                      run(() =>
                        deleteGalleryImageAction({
                          galleryImageId: image.id,
                          expectedVersion: image.version,
                        }),
                      );
                    }}
                  />
                  <MoveButtons
                    label={image.altTextFr}
                    index={index}
                    total={uploaded.length}
                    disabled={isPending}
                    onMove={(direction) =>
                      setUploadedIds(move(uploaded, index, direction).map((moved) => moved.id))
                    }
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button
                type="button"
                disabled={isPending}
                data-testid="uploads-order-save"
                onClick={() =>
                  run(() => reorderGalleryAction({ galleryImageIds: uploaded.map((i) => i.id) }))
                }
                className="rounded border border-line-strong px-3 py-2 text-sm font-semibold text-marine transition-colors hover:bg-sand disabled:opacity-60"
              >
                Enregistrer l&apos;ordre
              </button>
            </div>
          </>
        )}
      </section>

      <section className="border-t border-line pt-8">
        <h2 className="text-lg font-semibold">Ajouter une photographie</h2>
        <p className="mt-1 text-sm text-ink-soft">
          JPEG, PNG ou WebP, {MAX_IMAGE_BYTES / (1024 * 1024)} Mo maximum. La description est
          obligatoire&nbsp;: elle est ce qu&apos;un lecteur d&apos;écran annonce à la place de la
          photo.
        </p>
        <UploadForm
          isPending={isPending}
          uploadToken={uploadToken}
          onUpload={(formData) =>
            run(
              () => uploadGalleryImageAction(formData),
              () => setUploadToken((token) => token + 1),
            )
          }
        />
      </section>

      <ActionMessage result={message} />
    </div>
  );
}

/**
 * Moves one entry and returns a new list.
 *
 * Returns a new array rather than mutating, because React state compares by identity and an
 * in-place `splice` would leave the list looking unchanged: the arrows would appear to do
 * nothing.
 */
function move<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}

/**
 * Brings a locally edited list back in line with the server's copy of it.
 *
 * Row data always comes from the server, because each save sends the row's
 * `expectedVersion` and a version the server has already moved past is refused as a stale
 * write. The order is a separate question: moves are held locally until the owner saves
 * them, so adopting the server's order for an edit made somewhere else would throw away
 * moves they have not committed yet. Membership is what decides: the same photographs
 * means keep this order and refresh the rows behind it, a different set means the server
 * knows photographs this client does not — an upload, or a deletion — and its list wins
 * whole.
 */
/**
 * The photographs to render: the server's rows, ordered by the ids held locally.
 *
 * The rows are always the server's, so every save is visible as soon as `run()` re-reads the
 * page — an upload appears, a deleted photograph leaves, and each row carries the
 * `expectedVersion` the server will accept next, rather than one frozen at the state the page
 * arrived in. Only the order comes from the client.
 *
 * A local order that already matches the server's is not an order at all, so the server wins
 * outright and a photograph uploaded since the page loaded lands where the server put it. Once
 * the owner has moved something, their order is what counts, and a photograph the server has
 * that this order does not know about is appended — it has no place in a sequence the owner is
 * rearranging, and the next save of the order puts it there.
 */
function order<T>(ids: readonly string[], server: readonly T[], id: (item: T) => string): T[] {
  const byId = new Map(server.map((image) => [id(image), image]));

  // The local order, minus photographs the server no longer has and ids repeated by mistake.
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const key of ids) {
    if (byId.has(key) && !seen.has(key)) {
      seen.add(key);
      kept.push(key);
    }
  }

  const serverIds = server.map(id);
  const localMatchesServer =
    kept.length === serverIds.length && kept.every((key, index) => key === serverIds[index]);

  if (localMatchesServer) {
    return [...server];
  }

  const rows = kept.map((key) => byId.get(key) as T);
  for (const image of server) {
    if (!seen.has(id(image))) {
      rows.push(image);
    }
  }
  return rows;
}

/**
 * The two ordering buttons.
 *
 * A disabled arrow at either end rather than a hidden one, so the row does not change size as
 * it moves and the control does not appear and disappear under the owner's thumb.
 */
function MoveButtons({
  label,
  index,
  total,
  disabled,
  onMove,
}: {
  label: string;
  index: number;
  total: number;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        data-testid="move-up"
        aria-label={`Monter « ${label} »`}
        className="rounded border border-line px-2 py-1 text-sm disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={disabled || index === total - 1}
        onClick={() => onMove(1)}
        data-testid="move-down"
        aria-label={`Descendre « ${label} »`}
        className="rounded border border-line px-2 py-1 text-sm disabled:opacity-40"
      >
        ↓
      </button>
    </div>
  );
}

function SectionHeading({ title, count, description }: { title: string; count: number; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-ink-soft" data-testid="section-count">
          ({count})
        </span>
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
    </div>
  );
}

/**
 * The fields both kinds of photograph share.
 *
 * The identity is not part of this: each row's parent closes over the id it already holds, so
 * a generic component cannot end up sending a bundled photograph's slug to the uploaded
 * photograph action because both happened to have optional fields.
 */
interface GalleryFields {
  expectedVersion: number;
  altTextFr: string;
  captionFr: string;
  isVisible: boolean;
}

/** One bundled photograph: description, caption, visibility, and no delete. */
function BundledRow({
  image,
  isPending,
  onSave,
}: {
  image: MergedBundledGalleryImage;
  isPending: boolean;
  onSave: (payload: GalleryFields & { slug: string }) => void;
}) {
  return (
    <GalleryRow
      testId={`bundled-${image.slug}`}
      preview={
        <SafeImage
          src={bundledGalleryUrl(image.webpFile)}
          alt={image.altTextFr}
          width={image.width}
          height={image.height}
          className="aspect-[4/3] w-full object-cover"
          fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
        />
      }
      defaultAlt={image.altTextFr}
      defaultCaption={image.captionFr ?? ""}
      defaultVisible={image.isVisible}
      expectedVersion={image.version}
      isPending={isPending}
      onSave={(fields) => onSave({ ...fields, slug: image.slug })}
    />
  );
}

/** One uploaded photograph: the same fields, plus a delete that removes the stored asset too. */
function UploadedRow({
  image,
  isPending,
  onSave,
  onDelete,
}: {
  image: GalleryImageRow;
  isPending: boolean;
  onSave: (payload: GalleryFields & { galleryImageId: string }) => void;
  onDelete: () => void;
}) {
  return (
    <GalleryRow
      testId={`uploaded-${image.id}`}
      preview={
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(image.imageKey)}
          alt={image.altTextFr}
          className="aspect-[4/3] w-full rounded border border-line object-cover"
        />
      }
      defaultAlt={image.altTextFr}
      defaultCaption={image.captionFr ?? ""}
      defaultVisible={image.isVisible}
      expectedVersion={image.version}
      isPending={isPending}
      onSave={(fields) => onSave({ ...fields, galleryImageId: image.id })}
      onDelete={onDelete}
    />
  );
}

/**
 * The shape shared by both kinds of photograph.
 *
 * One component rather than two similar ones, because the fields, the version guard and the
 * visibility switch are identical. Only the preview, the delete button and the identity differ,
 * and those are supplied by each row's parent.
 */
function GalleryRow({
  testId,
  preview,
  defaultAlt,
  defaultCaption,
  defaultVisible,
  expectedVersion,
  isPending,
  onSave,
  onDelete,
}: {
  testId: string;
  preview: React.ReactNode;
  defaultAlt: string;
  defaultCaption: string;
  defaultVisible: boolean;
  expectedVersion: number;
  isPending: boolean;
  onSave: (payload: GalleryFields) => void;
  onDelete?: () => void;
}) {
  const [alt, setAlt] = useState(defaultAlt);
  const [caption, setCaption] = useState(defaultCaption);
  const [isVisible, setIsVisible] = useState(defaultVisible);

  return (
    <div className="rounded border border-line bg-white/60 p-3">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full shrink-0 overflow-hidden rounded border border-line sm:w-44">
          {preview}
        </div>

        <form
          className="min-w-0 flex-1 space-y-3"
          data-testid={`${testId}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ expectedVersion, altTextFr: alt, captionFr: caption, isVisible });
          }}
        >
          <Field
            label="Description de l'image"
            htmlFor={`${testId}-alt`}
            hint="Ce que l'image montre, pour les lecteurs d'écran."
          >
            <input
              id={`${testId}-alt`}
              value={alt}
              required
              maxLength={200}
              onChange={(event) => setAlt(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Légende" htmlFor={`${testId}-caption`} hint="Facultatif.">
            <input
              id={`${testId}-caption`}
              value={caption}
              maxLength={300}
              onChange={(event) => setCaption(event.target.value)}
              className={inputClass}
            />
          </Field>

          <ToggleField
            id={`${testId}-visible`}
            label="Visible sur le site"
            hint="Décochez pour la retirer de la page galerie sans la supprimer."
            checked={isVisible}
            onChange={setIsVisible}
            disabled={isPending}
          />

          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={isPending} testId={`${testId}-save`}>
              Enregistrer
            </SubmitButton>
            {onDelete ? (
              <button
                type="button"
                disabled={isPending}
                onClick={onDelete}
                data-testid={`${testId}-delete`}
                className="rounded border border-danger px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
              >
                Supprimer
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadForm({
  isPending,
  uploadToken,
  onUpload,
}: {
  isPending: boolean;
  uploadToken: number;
  onUpload: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  // Empties the file input after a successful upload; see `uploadToken` in the manager above.
  useEffect(() => {
    formRef.current?.reset();
  }, [uploadToken]);

  return (
    <form
      ref={formRef}
      className="mt-4 max-w-md space-y-3"
      data-testid="gallery-upload-form"
      onSubmit={(event) => {
        event.preventDefault();
        onUpload(new FormData(event.currentTarget));
      }}
    >
      <Field label="Fichier" htmlFor="gallery-file">
        <input
          id="gallery-file"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="w-full text-xs file:mr-3 file:rounded file:border file:border-line-strong file:bg-sand file:px-3 file:py-2 file:text-sm"
        />
      </Field>

      <Field label="Description de l'image" htmlFor="gallery-alt" hint="Obligatoire.">
        <input id="gallery-alt" name="altTextFr" required maxLength={200} className={inputClass} />
      </Field>

      <Field label="Légende" htmlFor="gallery-caption" hint="Facultatif.">
        <input id="gallery-caption" name="captionFr" maxLength={300} className={inputClass} />
      </Field>

      <SubmitButton pending={isPending} testId="gallery-upload">
        Ajouter la photographie
      </SubmitButton>
    </form>
  );
}
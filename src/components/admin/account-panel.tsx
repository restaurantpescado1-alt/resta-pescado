"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { changePasswordAction, signOutAction } from "@/app/admin/owner-actions";
import { ActionMessage, Field, SubmitButton, inputClass } from "@/components/admin/form-parts";
import type { ActionResult } from "@/lib/action-result";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/validation";

/**
 * The account section: change the password, and sign out.
 *
 * The password form is the only way back into this dashboard if the owner locks themselves
 * out, because email delivery is not configured. `docs/SECURITY.md` records that gap, and it
 * is why the current password is required rather than a reset link.
 */
export function AccountPanel({
  email,
  signOutLabel = "Se déconnecter",
}: {
  email: string;
  signOutLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: String(data.get("currentPassword") ?? ""),
        newPassword: String(data.get("newPassword") ?? ""),
      });
      setMessage(result);
      if (result.ok) {
        /*
         * Both fields are cleared on success rather than on submit: a password left sitting in
         * a DOM field after it has been changed is a password sitting in the browser's memory
         * for no reason.
         */
        formRef.current?.reset();
      }
    });
  }

  return (
    <div className="mt-6 space-y-10">
      <section>
        <h2 className="text-lg font-semibold">Compte</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Connecté avec <span data-testid="account-email">{email}</span>. Aucun autre compte ne peut
          se connecter&nbsp;: l&apos;inscription est désactivée.
        </p>
      </section>

      <section className="max-w-md">
        <h2 className="text-lg font-semibold">Changer le mot de passe</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Le mot de passe actuel est demandé pour confirmer que c&apos;est bien vous. Les autres
          sessions ouvertes seront déconnectées.
        </p>

        <form ref={formRef} onSubmit={submit} className="mt-4 space-y-4" data-testid="password-form">
          <Field label="Mot de passe actuel" htmlFor="currentPassword">
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={MAX_PASSWORD_LENGTH}
              className={inputClass}
            />
          </Field>

          <Field
            label="Nouveau mot de passe"
            htmlFor="newPassword"
            hint={`Entre ${MIN_PASSWORD_LENGTH} et ${MAX_PASSWORD_LENGTH} caractères.`}
          >
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton pending={isPending} testId="password-save">
              Changer le mot de passe
            </SubmitButton>
            <ActionMessage result={message} />
          </div>
        </form>

        {/*
          Stated rather than hidden. There is no "mot de passe oublié" link, and an owner who
          looks for one should be told why it is not there instead of concluding the feature is
          broken.
        */}
        <p className="mt-4 text-xs text-ink-soft">
          Il n&apos;y a pas de lien «&nbsp;mot de passe oublié&nbsp;»&nbsp;: aucun e-mail n&apos;est
          envoyé par ce site. En cas de oubli, il faudra passer par votre hébergeur.
        </p>
      </section>

      <section className="border-t border-line pt-6">
        <h2 className="text-lg font-semibold">Session</h2>
        <form
          action={async () => {
            await signOutAction();
            router.refresh();
          }}
          className="mt-3"
          data-testid="sign-out-form"
        >
          <SubmitButton pending={isPending} tone="quiet" testId="sign-out">
            {signOutLabel}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
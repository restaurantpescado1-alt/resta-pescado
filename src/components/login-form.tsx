"use client";

import { createAuthClient } from "better-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_OWNER_REDIRECT, safeRedirectPath } from "@/lib/redirects";

/**
 * Owner sign-in. Public registration is disabled server-side, so this form only
 * ever posts `signInEmail`; there is no sign-up path in the client either.
 *
 * `redirectTo` arrives already sanitised by the server page, and is sanitised
 * again here. The value reaches `router.push`, so it must never be trusted from
 * a query string alone.
 */
export function LoginForm({ redirectTo = DEFAULT_OWNER_REDIRECT }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const authClient = createAuthClient();

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    if (signInError) {
      setError("Identifiants incorrects.");
      setPending(false);
      return;
    }

    router.push(safeRedirectPath(redirectTo));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger" data-testid="login-error">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-marine px-4 py-2.5 text-sm font-semibold text-on-ocean transition-colors hover:bg-ocean disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

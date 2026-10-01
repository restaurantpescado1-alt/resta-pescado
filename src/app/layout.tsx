import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Resta Pescado",
  description: "Poissons et fruits de mer, préparés à Alger.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-line bg-sea-deep text-sand">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Resta&nbsp;Pescado
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/menu" className="underline-offset-4 hover:underline">
                La carte
              </Link>
              <Link href="/admin/login" className="underline-offset-4 hover:underline">
                Espace propriétaire
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-line bg-sand">
          <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-ink-soft">
            <p>Resta Pescado — Poissons et fruits de mer, Alger.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Espace propriétaire — Resta Pescado",
  robots: { index: false, follow: false },
};

/**
 * Passes children through unchanged.
 *
 * The layout exists only to keep the admin area out of search indexes, but a
 * `layout.tsx` still has to default-export a component: Next.js rejects the file
 * otherwise, and every admin page fails with a 500.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import Link from "next/link";

/**
 * Testpagina's buiten het menu: `/marnix/<tool>`. Geen sidebar, geen
 * menu-item. Alleen admins komen hier (zie `TEST_HREF` in `lib/access.ts`);
 * de middleware stuurt anderen terug naar het dashboard.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-psv-neutralDark">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="font-text text-sm text-white/80 transition-colors hover:text-white">
            ← PSV Tools
          </Link>
          <span className="tag tag--gold">Testpagina, niet in het menu</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

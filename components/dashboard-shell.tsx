"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { FeedbackTab } from "@/components/feedback-tab";

export function DashboardShell({
  children,
  allowedPages,
  isAdmin,
}: {
  children: React.ReactNode;
  allowedPages: string[];
  isAdmin: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label="Open navigatie"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Image src="/images/psv-logo.png" alt="PSV" width={28} height={28} />
        <span className="text-sm font-heading uppercase tracking-wide text-sidebar-foreground">
          PSV Tools
        </span>
      </div>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, in de flex-rij op desktop.
          `lg:relative lg:z-40`: het Beta tools-menu steekt over de inhoud
          heen, en `<main>` is `relative`. Zonder eigen laag tekent de inhoud
          over de zijbalk en ligt het menu eronder. Onder z-50 blijven
          pop-ups en dialogen in de inhoud er wel boven. */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:relative lg:translate-x-0 lg:z-40 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AppSidebar
          allowedPages={allowedPages}
          isAdmin={isAdmin}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Main content — top padding on mobile to clear the fixed header.
          `relative`: een absoluut geplaatst element in de inhoud (zoals een
          `sr-only`-label) hoort bij deze scrollende kolom. Zonder dat hangt het
          aan de pagina zelf en maakt het die langer dan het scherm: dan scrolt
          de hele pagina door en schuift de zijbalk half uit beeld. */}
      <main className="relative flex-1 overflow-y-auto bg-background pt-14 lg:pt-0">
        {children}
      </main>

      <FeedbackTab />
    </div>
  );
}

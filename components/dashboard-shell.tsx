"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
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

      {/* Sidebar — fixed overlay on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0 lg:z-auto transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AppSidebar onMobileClose={() => setMobileOpen(false)} />
      </div>

      {/* Main content — top padding on mobile to clear the fixed header */}
      <main className="flex-1 overflow-y-auto bg-background pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}

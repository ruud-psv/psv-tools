"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_HREF } from "@/lib/access";
import { activeHref, firstHref, isUnder, sectionForPath, sectionsFor, type NavSection } from "@/lib/navigation";

const COLLAPSED_KEY = "sidebar-panel-collapsed";

/** Eén knop op de rail: icoon met de naam eronder, zoals in Teams en Slack. */
function RailItem({
  label,
  icon: Icon,
  active,
  href,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "group relative flex w-full flex-col items-center gap-1 px-1 py-2 transition-colors",
    active ? "text-sidebar-foreground" : "text-psv-gray-09 hover:text-sidebar-foreground"
  );
  const inner = (
    <>
      {/* Rode streep links bij het actieve onderdeel. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary transition-opacity",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
          active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "group-hover:bg-sidebar-accent"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="max-w-full truncate font-text text-[11px] leading-tight">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function BetaLabel() {
  return (
    <span className="flex-shrink-0 rounded-sm border border-psv-gold/60 px-1.5 py-px font-text text-[10px] text-psv-gold">
      Beta
    </span>
  );
}

/** Het paneel naast de rail: de pagina's onder het actieve onderdeel. */
function Panel({
  section,
  currentHref,
  onCollapse,
  onNavigate,
  className,
}: {
  section: NavSection;
  /** De link van de huidige pagina (zie `activeHref`). */
  currentHref: string | null;
  onCollapse: () => void;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("w-60 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar", className)}>
      <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <p className="truncate font-text text-lg font-bold text-sidebar-foreground">
          {section.name}
        </p>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Paneel inklappen"
          className="hidden flex-shrink-0 rounded-md p-1 text-psv-gray-09 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:block"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {section.groups.map((group, i) => (
          <div key={group.title ?? i}>
            {group.title && (
              <p className="mb-1 px-2 font-text text-xs font-bold text-psv-gray-09">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.links.map((link) => {
                const Icon = link.icon;
                const active = link.href === currentHref;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 flex-shrink-0", active && "text-sidebar-primary")} />
                      <span className="flex-1 truncate">{link.name}</span>
                      {link.beta && <BetaLabel />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function AppSidebar({
  allowedPages,
  isAdmin,
  onMobileClose,
}: {
  /** De hrefs waar deze gebruiker recht op heeft (zie `lib/access.ts`). */
  allowedPages: string[];
  isAdmin: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = useMemo(() => sectionsFor(allowedPages), [allowedPages]);
  const active = sectionForPath(sections, pathname);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSED_KEY) === "true") setCollapsed(true);
    } catch {
      // Zonder opslag blijft het paneel gewoon open.
    }
  }, []);

  function setPanelCollapsed(value: boolean) {
    setCollapsed(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(value));
    } catch {
      // Niet erg: dan onthoudt de browser het alleen niet.
    }
  }

  async function handleLogout() {
    onMobileClose?.();
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Een onderdeel met één pagina heeft geen paneel nodig: de rail brengt je er al.
  const hasPanel = active !== null && active.groups.flatMap((g) => g.links).length > 1;

  return (
    <div className="flex h-screen">
      <aside className="flex w-[72px] flex-shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar">
        <Link
          href="/dashboard"
          onClick={onMobileClose}
          title="Overzicht"
          aria-label="Overzicht"
          className="flex h-16 w-full flex-shrink-0 items-center justify-center border-b border-sidebar-border transition-opacity hover:opacity-80"
        >
          <Image src="/images/psv-logo.png" alt="PSV" width={36} height={36} />
        </Link>

        <nav className="flex w-full flex-1 flex-col gap-1 overflow-y-auto py-3" aria-label="Onderdelen">
          {sections.map((section) => {
            const isActive = active?.id === section.id;
            return (
              <RailItem
                key={section.id}
                label={section.name}
                icon={section.icon}
                active={isActive}
                href={isActive ? undefined : firstHref(section)}
                onClick={() => {
                  // Nogmaals klikken op het actieve onderdeel klapt het paneel in of uit.
                  if (isActive) setPanelCollapsed(!collapsed);
                  else setPanelCollapsed(false);
                }}
              />
            );
          })}
        </nav>

        <div className="flex w-full flex-col gap-1 border-t border-sidebar-border py-3">
          {hasPanel && collapsed && (
            <RailItem label="Paneel" icon={PanelLeftOpen} active={false} onClick={() => setPanelCollapsed(false)} />
          )}
          {isAdmin && (
            <RailItem
              label="Beheer"
              icon={Settings}
              active={isUnder(pathname, ADMIN_HREF)}
              href={ADMIN_HREF}
              onClick={onMobileClose}
            />
          )}
          <RailItem label="Uitloggen" icon={LogOut} active={false} onClick={handleLogout} />
        </div>
      </aside>

      {hasPanel && active && (
        <Panel
          // Een nieuwe key per onderdeel, zodat het paneel bij wisselen opnieuw infadet.
          key={active.id}
          section={active}
          currentHref={activeHref(sections, pathname)}
          onCollapse={() => setPanelCollapsed(true)}
          onNavigate={onMobileClose}
          // Op mobiel staat het paneel altijd open in de lade; inklappen is voor desktop.
          className={cn("flex animate-fade-up [animation-duration:200ms]", collapsed && "lg:hidden")}
        />
      )}
    </div>
  );
}

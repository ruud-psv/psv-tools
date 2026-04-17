"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  BarChart2,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Ticket,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const navItems = [
  {
    name: "Overzicht",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
];

const tools = [
  {
    name: "Mail tekst generator",
    href: "/dashboard/copy-generator",
    icon: FileText,
    badge: null as string | null,
  },
  {
    name: "UTM Builder",
    href: "/dashboard/utm-builder",
    icon: Link2,
    badge: null as string | null,
  },
  {
    name: "Huisstijl Checker",
    href: "/dashboard/huisstijl-checker",
    icon: ClipboardCheck,
    badge: null as string | null,
  },
];

const insights = [
  {
    name: "Rapportage generator",
    href: "/dashboard/rapportage-generator",
    icon: BarChart2,
    badge: null as string | null,
  },
  {
    name: "Ticket Inzichten",
    href: "/dashboard/ticket-inzichten",
    icon: Ticket,
    badge: null as string | null,
  },
  {
    name: "DM Performance",
    href: "/dashboard/dm-performance",
    icon: Mail,
    badge: null as string | null,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      {collapsed ? (
        <button
          onClick={toggleCollapsed}
          className="flex flex-col items-center gap-2 px-3 py-4 border-b border-sidebar-border hover:bg-sidebar-accent transition-colors"
        >
          <Image
            src="/images/psv-logo.png"
            alt="PSV"
            width={40}
            height={40}
          />
          <PanelLeftOpen className="h-3.5 w-3.5 text-psv-gray-09" />
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border">
          <Image
            src="/images/psv-logo.png"
            alt="PSV"
            width={40}
            height={40}
            className="flex-shrink-0"
          />
          <p className="text-sm font-heading uppercase tracking-wide text-sidebar-foreground truncate flex-1">
            PSV Tools
          </p>
          <button
            onClick={toggleCollapsed}
            className="flex-shrink-0 p-1 rounded-md text-psv-gray-09 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-2 mb-1 font-heading text-xs uppercase tracking-wider text-psv-gray-09">
              Navigatie
            </p>
          )}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Tools */}
        <div>
          {!collapsed && (
            <p className="px-2 mb-1 font-heading text-xs uppercase tracking-wider text-psv-gray-09">
              Tools
            </p>
          )}
          <ul className="space-y-0.5">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isActive = pathname.startsWith(tool.href);
              return (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    title={collapsed ? tool.name : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{tool.name}</span>
                        {tool.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {tool.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Inzichten */}
        <div>
          {!collapsed && (
            <p className="px-2 mb-1 font-heading text-xs uppercase tracking-wider text-psv-gray-09">
              Inzichten
            </p>
          )}
          <ul className="space-y-0.5">
            {insights.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{item.name}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-2 py-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-psv-gray-09 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span>Uitloggen</span>
          </button>
        </div>
      )}
    </aside>
  );
}

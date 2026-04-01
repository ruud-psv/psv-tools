"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { FileText, LayoutDashboard, LogOut } from "lucide-react";
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
    name: "Copy Generator",
    href: "/dashboard/copy-generator",
    icon: FileText,
    badge: null as string | null,
  },
  // Future tools can be added here
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-sidebar-border">
        <Image
          src="/images/psv-logo.png"
          alt="PSV"
          width={40}
          height={40}
          className="flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sidebar-foreground truncate">
            PSV Tools
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Content platform
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Main */}
        <div>
          <p className="px-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Navigatie
          </p>
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
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Tools */}
        <div>
          <p className="px-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tools
          </p>
          <ul className="space-y-0.5">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isActive = pathname.startsWith(tool.href);
              return (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate flex-1">{tool.name}</span>
                    {tool.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {tool.badge}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Uitloggen</span>
        </button>
      </div>
    </aside>
  );
}

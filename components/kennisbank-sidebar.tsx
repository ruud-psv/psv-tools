"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  kennisbankCategories,
  toolsByCategory,
  getToolSections,
  getToolBySlug,
} from "@/lib/kennisbank";

export function KennisbankSidebar() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<string>("");

  const toolSlug = pathname.startsWith("/dashboard/kennisbank/")
    ? pathname.replace("/dashboard/kennisbank/", "").split("/")[0]
    : null;

  const activeSections = useMemo(() => {
    const tool = toolSlug ? getToolBySlug(toolSlug) : null;
    return tool ? getToolSections(tool) : [];
  }, [toolSlug]);

  useEffect(() => {
    setActiveSection("");
    if (activeSections.length === 0) return;

    const elements = activeSections
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [activeSections]);

  return (
    <aside className="sticky top-0 h-screen w-56 flex-shrink-0 overflow-y-auto border-r border-border bg-background">
      <nav className="py-6 px-3 space-y-4">
        <Link
          href="/dashboard/kennisbank"
          className={cn(
            "block px-2 text-xs font-heading uppercase tracking-wider transition-colors",
            pathname === "/dashboard/kennisbank"
              ? "text-foreground font-bold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Kennisbank
        </Link>

        {kennisbankCategories.map((category) => (
          <div key={category} className="space-y-0.5">
            <p className="px-2 py-1 text-xs font-heading uppercase tracking-wider text-muted-foreground">
              {category}
            </p>

            {toolsByCategory[category].map((tool) => {
              const isActive = tool.slug === toolSlug;

              return (
                <div key={tool.slug}>
                  <Link
                    href={`/dashboard/kennisbank/${tool.slug}`}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    {tool.name}
                  </Link>

                  {isActive && activeSections.length > 0 && (
                    <div className="ml-3 mt-0.5 mb-1 border-l border-border pl-3 space-y-0.5">
                      {activeSections.map((section) => (
                        <a
                          key={section.id}
                          href={`#${section.id}`}
                          className={cn(
                            "block rounded px-1.5 py-1 text-xs transition-colors",
                            activeSection === section.id
                              ? "text-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {section.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

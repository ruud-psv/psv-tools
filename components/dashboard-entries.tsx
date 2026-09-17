import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toolGroups, type ToolEntry } from "@/lib/tools";

function ToolCard({ entry }: { entry: ToolEntry }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="flex h-full flex-col gap-3 p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-psv-lg">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-psv-red-primary/10 text-psv-red-primary transition-colors group-hover:bg-psv-red-primary group-hover:text-psv-white">
            <Icon className="h-5 w-5" />
          </span>
          {entry.badge && (
            <Badge variant="secondary" className="flex-shrink-0">
              {entry.badge}
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-heading text-lg uppercase leading-tight tracking-wide">
            {entry.title}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {entry.description}
          </p>
        </div>

        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 font-heading text-xs uppercase tracking-wide text-psv-red-primary">
          Openen
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </Card>
    </Link>
  );
}

/** De ingangen van Tools als kaarten, gegroepeerd zoals in de sidebar. */
export function DashboardEntries() {
  return (
    <div className="space-y-10">
      {toolGroups.map((group) => (
        <section key={group.label}>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="font-heading text-xl uppercase tracking-wide">
              {group.label}
            </h2>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {group.intro}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.entries.map((entry) => (
              <div
                key={entry.href}
                // Een groep met één ingang zou anders als los kaartje in een
                // lege rij hangen; over twee kolommen oogt het bedoeld.
                className={group.entries.length === 1 ? "sm:col-span-2" : undefined}
              >
                <ToolCard entry={entry} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

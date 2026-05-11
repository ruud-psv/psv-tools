import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { kennisbankTools, getToolBySlug, slugify, KennisbankTip } from "@/lib/kennisbank";

const TIP_CONFIG: Record<KennisbankTip["type"], { label: string; className: string }> = {
  warning: { label: "Let op:", className: "border-l-warning bg-warning-bg" },
  note: { label: "Opmerking:", className: "border-l-info bg-info-bg" },
  tip: { label: "Tip:", className: "border-l-success bg-success-bg" },
};
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function generateStaticParams() {
  return kennisbankTools.map((tool) => ({ tool: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) return {};
  return { title: `${tool.name} | PSV Tools` };
}

export default async function KennisbankToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) notFound();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-heading uppercase tracking-tight mb-1">
          {tool.name}
        </h1>
        <p className="text-muted-foreground">{tool.description}</p>
      </div>

      {/* Coming soon */}
      {tool.comingSoon && (
        <Card className="border-l-4 border-l-psv-gold-primary bg-warning-bg border-t-0">
          <CardContent className="pt-6">
            <p className="text-sm font-medium">
              De documentatie voor {tool.name} wordt binnenkort aangevuld.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Neem voor vragen contact op met het Digital Marketing-team.
            </p>
          </CardContent>
        </Card>
      )}

      {!tool.comingSoon && (
        <div className="space-y-8">
          {/* Access */}
          {(tool.accessUrl || tool.accessNote || tool.accessLinks?.length || tool.docsUrl) && (
            <section id="toegang">
              <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                Toegang
              </h2>
              <Card>
                <CardContent className="pt-6 space-y-2">
                  {tool.accessNote && (
                    <p className="text-sm text-muted-foreground">
                      {tool.accessNote}
                    </p>
                  )}
                  {tool.accessUrl && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-32 flex-shrink-0">Inloggen</span>
                      <a
                        href={tool.accessUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-psv-red-primary hover:underline"
                      >
                        {tool.accessUrl}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                  {tool.accessLinks?.map((link) => (
                    <div key={link.url} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-32 flex-shrink-0">{link.label}</span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-psv-red-primary hover:underline"
                      >
                        Inloggen
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                  {tool.docsUrl && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-32 flex-shrink-0">Documentatie</span>
                      <a
                        href={tool.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-psv-red-primary hover:underline"
                      >
                        {tool.docsUrl}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Features */}
          {tool.features.length > 0 && (
            <section id="mogelijkheden">
              <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                Mogelijkheden
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tool.features.map((feature) => (
                  <Card key={feature.title}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Steps */}
          {tool.steps && tool.steps.length > 0 && (
            <section id="aan-de-slag">
              <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                Aan de slag
              </h2>
              <div className="space-y-3">
                {tool.steps.map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-psv-red-primary text-white text-xs font-heading font-bold">
                      {i + 1}
                    </div>
                    <div className="pt-0.5">
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tables */}
          {tool.tables && tool.tables.length > 0 &&
            tool.tables.map((table, ti) => (
                <section key={ti} id={table.caption ? slugify(table.caption) : undefined}>
                  {table.caption && (
                    <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                      {table.caption}
                    </h2>
                  )}
                  <Card>
                    <CardContent className="pt-6 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            {table.headers.map((h) => (
                              <th
                                key={h}
                                className="pb-2 pr-4 text-left font-heading text-xs uppercase tracking-wider text-muted-foreground"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, ri) => (
                            <tr
                              key={ri}
                              className="border-b border-border last:border-0"
                            >
                              {row.map((cell, ci) => (
                                <td
                                  key={ci}
                                  className={`py-2.5 pr-4 ${ci === 0 ? "font-medium" : "text-muted-foreground"}`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </section>
              ))}

          {/* Tips & Warnings */}
          {tool.tips && tool.tips.length > 0 && (
            <section id="tips">
              <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                Tips
              </h2>
              <div className="space-y-3">
                {tool.tips.map((tip, i) => {
                  const { label, className } = TIP_CONFIG[tip.type];
                  return (
                    <div
                      key={i}
                      className={`rounded-md border-l-4 p-4 text-sm text-foreground ${className}`}
                    >
                      <span className="font-medium mr-1">{label}</span>
                      {tip.text}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

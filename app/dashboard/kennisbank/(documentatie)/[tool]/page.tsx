import { notFound } from "next/navigation";
import {
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";
import {
  kennisbankTools,
  getToolBySlug,
  slugify,
  figmaEmbedUrl,
  KennisbankTip,
  KennisbankChecklistGroup,
  KennisbankFlowBadgeTone,
} from "@/lib/kennisbank";

const TIP_CONFIG: Record<KennisbankTip["type"], { label: string; className: string }> = {
  warning: { label: "Let op:", className: "border-l-warning bg-warning-bg" },
  note: { label: "Opmerking:", className: "border-l-info bg-info-bg" },
  tip: { label: "Tip:", className: "border-l-success bg-success-bg" },
};

const CHECKLIST_CONFIG: Record<
  KennisbankChecklistGroup["type"],
  { icon: LucideIcon; card: string; accent: string; chip: string }
> = {
  include: {
    icon: CheckCircle2,
    card: "border-l-success bg-success-bg",
    accent: "text-success",
    chip: "border-success/40 bg-white text-foreground",
  },
  conditional: {
    icon: AlertTriangle,
    card: "border-l-warning bg-warning-bg",
    accent: "text-warning",
    chip: "border-warning/40 bg-white text-foreground",
  },
  exclude: {
    icon: XCircle,
    card: "border-l-error bg-error-bg",
    accent: "text-error",
    chip: "border-error/40 bg-white text-foreground",
  },
};

const FLOW_BADGE_CONFIG: Record<KennisbankFlowBadgeTone, string> = {
  "sso-on": "border-psv-red-primary/30 bg-psv-red-primary/10 text-psv-red-primary",
  "sso-off": "border-psv-gold-primary/40 bg-psv-gold-primary/10 text-foreground",
  visible: "border-success/40 bg-success-bg text-success",
  hidden: "border-border bg-muted text-muted-foreground",
  neutral: "border-border bg-white text-foreground",
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
            {tool.docsUrl && (
              <a
                href={tool.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-psv-red-primary hover:underline mt-3"
              >
                Officiële documentatie {tool.name}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
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
              <div className="relative space-y-6">
                {/* connecting timeline line */}
                {tool.steps.length > 1 && (
                  <div
                    aria-hidden
                    className="absolute left-[13px] top-3 bottom-3 w-px bg-border"
                  />
                )}
                {tool.steps.map((step, i) => (
                  <div key={i} className="relative flex gap-4">
                    <div className="relative z-10 flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-psv-red-primary text-white text-xs font-heading font-bold ring-4 ring-background">
                      {i + 1}
                    </div>
                    <div className="pt-0.5">
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Flows */}
          {tool.flows && tool.flows.length > 0 &&
            tool.flows.map((flow, fi) => (
              <section
                key={fi}
                id={flow.caption ? slugify(flow.caption) : undefined}
              >
                {flow.caption && (
                  <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                    {flow.caption}
                  </h2>
                )}
                {flow.intro && (
                  <p className="text-sm text-muted-foreground mb-4 -mt-1">
                    {flow.intro}
                  </p>
                )}
                <div className="flex flex-col md:flex-row md:items-stretch">
                  {flow.stages.map((stage, si) => {
                    const VisIcon = stage.visibleToUser ? Eye : EyeOff;
                    return (
                      <div
                        key={si}
                        className="flex flex-col md:flex-1 md:flex-row md:items-stretch"
                      >
                        <Card
                          className={`h-full flex-1 border-t-4 ${
                            stage.visibleToUser
                              ? "border-t-psv-red-primary"
                              : "border-t-border"
                          }`}
                        >
                          <CardContent className="flex h-full flex-col pt-5 pb-5">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-psv-red-primary text-[11px] font-heading font-bold text-white">
                                {si + 1}
                              </span>
                              <h3 className="font-heading text-sm uppercase tracking-wide">
                                {stage.title}
                              </h3>
                            </div>
                            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                                  stage.visibleToUser
                                    ? "border-success/40 bg-success-bg text-success"
                                    : "border-border bg-muted text-muted-foreground"
                                }`}
                              >
                                <VisIcon className="h-3 w-3" />
                                {stage.visibilityLabel}
                              </span>
                              {stage.badges?.map((b, bi) => (
                                <span
                                  key={bi}
                                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                                    FLOW_BADGE_CONFIG[b.tone ?? "neutral"]
                                  }`}
                                >
                                  {b.label}
                                </span>
                              ))}
                            </div>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {stage.description}
                            </p>
                          </CardContent>
                        </Card>
                        {si < flow.stages.length - 1 && (
                          <div
                            aria-hidden
                            className="flex items-center justify-center py-1 text-psv-red-primary md:px-2 md:py-0"
                          >
                            <ArrowDown className="h-5 w-5 md:hidden" />
                            <ArrowRight className="hidden h-5 w-5 md:block" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

          {/* Embeds */}
          {tool.embeds && tool.embeds.length > 0 &&
            tool.embeds.map((embed, ei) => (
              <section
                key={ei}
                id={embed.caption ? slugify(embed.caption) : undefined}
              >
                {embed.caption && (
                  <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                    {embed.caption}
                  </h2>
                )}
                {embed.intro && (
                  <p className="text-sm text-muted-foreground mb-4 -mt-1">
                    {embed.intro}
                  </p>
                )}
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <iframe
                      src={figmaEmbedUrl(embed.url)}
                      title={embed.caption ?? `${tool.name} embed`}
                      className="w-full border-0 block"
                      style={{ height: embed.height ?? 480 }}
                      allowFullScreen
                      loading="lazy"
                    />
                  </CardContent>
                </Card>
                <a
                  href={embed.openUrl ?? embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-psv-red-primary hover:underline mt-3"
                >
                  Openen in Figma
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </section>
            ))}

          {/* Checklists */}
          {tool.checklists && tool.checklists.length > 0 &&
            tool.checklists.map((checklist, ci) => (
              <section
                key={ci}
                id={checklist.caption ? slugify(checklist.caption) : undefined}
              >
                {checklist.caption && (
                  <h2 className="text-xl font-heading uppercase tracking-tight mb-3">
                    {checklist.caption}
                  </h2>
                )}
                {checklist.intro && (
                  <p className="text-sm text-muted-foreground mb-4 -mt-1">
                    {checklist.intro}
                  </p>
                )}
                <div className="space-y-3">
                  {checklist.groups.map((group, gi) => {
                    const { icon: Icon, card, accent, chip } =
                      CHECKLIST_CONFIG[group.type];
                    return (
                      <Card
                        key={gi}
                        className={`border-l-4 border-t-0 border-r-0 border-b-0 ${card}`}
                      >
                        <CardContent className="pt-5 pb-5">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`h-4 w-4 flex-shrink-0 ${accent}`} />
                            <h3
                              className={`font-heading text-sm uppercase tracking-wide ${accent}`}
                            >
                              {group.title}
                            </h3>
                            <span className="ml-auto text-xs font-medium text-muted-foreground">
                              {group.items.length}
                            </span>
                          </div>
                          {group.description && (
                            <p className="text-sm text-muted-foreground mb-3">
                              {group.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {group.items.map((item, ii) => (
                              <span
                                key={ii}
                                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${chip}`}
                              >
                                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${accent}`} />
                                <span>{item.label}</span>
                                {item.note && (
                                  <span className="text-muted-foreground">
                                    — {item.note}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}

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

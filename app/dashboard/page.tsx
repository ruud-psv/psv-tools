import Link from "next/link";
import { ClipboardCheck, FileText, Link2, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const tools = [
  {
    name: "Copy Generator",
    description:
      "Genereer PSV e-mail copy en partner mailings met behulp van AI. Vul de benodigde velden in en ontvang kant-en-klare teksten.",
    href: "/dashboard/copy-generator",
    icon: FileText,
    badge: "Beschikbaar",
    badgeVariant: "default" as const,
  },
  {
    name: "UTM Builder",
    description:
      "Bouw Google UTM-links voor campagnetracking. Vul de URL en UTM-parameters in en kopieer de gegenereerde link direct naar klembord.",
    href: "/dashboard/utm-builder",
    icon: Link2,
    badge: "Beschikbaar",
    badgeVariant: "default" as const,
  },
  {
    name: "Huisstijl Checker",
    description:
      "Laat teksten controleren door de PSV Huisstijl Agent. De agent corrigeert op basis van Het Rood-Witte Boekje en geeft de verbeterde tekst direct terug.",
    href: "/dashboard/huisstijl-checker",
    icon: ClipboardCheck,
    badge: "Beschikbaar",
    badgeVariant: "default" as const,
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welkom bij PSV Tools. Kies een tool om te beginnen.
        </p>
      </div>

      {/* Tools grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card
              key={tool.href}
              className="group relative flex flex-col transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge variant={tool.badgeVariant}>{tool.badge}</Badge>
                </div>
                <CardTitle className="mt-3 text-lg">{tool.name}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {tool.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Button asChild variant="outline" className="w-full gap-2">
                  <Link href={tool.href}>
                    Openen
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {/* Coming soon placeholder */}
        <Card className="flex flex-col border-dashed opacity-60">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <span className="text-lg">+</span>
              </div>
              <Badge variant="outline">Binnenkort</Badge>
            </div>
            <CardTitle className="mt-3 text-lg text-muted-foreground">
              Meer tools
            </CardTitle>
            <CardDescription>
              Er worden binnenkort meer tools toegevoegd aan het platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto pt-0">
            <Button variant="outline" className="w-full" disabled>
              Nog niet beschikbaar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

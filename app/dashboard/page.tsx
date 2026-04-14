import Link from "next/link";
import { BarChart2, ClipboardCheck, FileText, Link2, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const tools = [
  {
    name: "Mail tekst generator",
    description:
      "Genereer PSV e-mail copy en partner mailings met behulp van AI. Vul de benodigde velden in en ontvang kant-en-klare teksten.",
    href: "/dashboard/copy-generator",
    icon: FileText,
  },
  {
    name: "UTM Builder",
    description:
      "Bouw Google UTM-links voor campagnetracking. Vul de URL en UTM-parameters in en kopieer de gegenereerde link direct naar klembord.",
    href: "/dashboard/utm-builder",
    icon: Link2,
  },
  {
    name: "Huisstijl Checker",
    description:
      "Laat teksten controleren door de PSV Huisstijl Agent. De agent corrigeert op basis van Het Rood-Witte Boekje en geeft de verbeterde tekst direct terug.",
    href: "/dashboard/huisstijl-checker",
    icon: ClipboardCheck,
  },
  {
    name: "Rapportage generator",
    description:
      "Upload een Excel bestand en ontvang automatisch een analyse met KPI's, grafieken en concrete inzichten — ongeacht hoe het bestand is opgebouwd.",
    href: "/dashboard/rapportage-generator",
    icon: BarChart2,
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-heading uppercase tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welkom bij PSV Tools. Kies een tool om te beginnen.
        </p>
      </div>

      {/* Tools grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card
              key={tool.href}
              className="group relative flex flex-col transition-shadow hover:shadow-psv-lg"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center bg-psv-red-primary text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="tag">Beschikbaar</span>
                </div>
                <CardTitle className="mt-4 text-lg">{tool.name}</CardTitle>
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
        <Card className="flex flex-col border-t-psv-gray-08 border-dashed opacity-60">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center bg-psv-gray-07 text-muted-foreground">
                <span className="text-xl font-heading">+</span>
              </div>
              <span className="tag tag--outlined">Binnenkort</span>
            </div>
            <CardTitle className="mt-4 text-lg text-muted-foreground">
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

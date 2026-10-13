import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, MessageCircle } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { kennisbankTools, kennisbankCategories } from "@/lib/kennisbank";

export const metadata = {
  title: "Documentatie | Kennisbank | PSV Tools",
};

function ToolLogo({ logo, name }: { logo?: string; name: string }) {
  if (logo) {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-muted p-1.5">
        <Image src={logo} alt={name} width={20} height={20} className="object-contain" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-psv-red-primary text-white text-xs font-heading font-bold">
      {name.charAt(0)}
    </div>
  );
}

export default function KennisbankDocumentatiePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-3xl font-heading uppercase tracking-tight">
              Documentatie
            </h1>
          </div>
          <p className="text-muted-foreground">
            Handleidingen en best practices voor alle tools en platforms die PSV gebruikt.
          </p>
        </div>
        <Link
          href="/dashboard/kennisbank"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-heading text-xs uppercase tracking-wide transition-colors hover:border-psv-red-primary"
        >
          <MessageCircle className="h-4 w-4 text-psv-red-primary" />
          Stel een vraag
        </Link>
      </div>

      <div className="space-y-10">
        {kennisbankCategories.map((category) => {
          const tools = kennisbankTools.filter((t) => t.category === category);
          return (
            <section key={category}>
              <h2 className="font-heading text-xs uppercase tracking-wider text-psv-gray-09 mb-3">
                {category}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <Link
                    key={tool.slug}
                    href={`/dashboard/kennisbank/${tool.slug}`}
                    className="group block focus:outline-none"
                  >
                    <Card className="h-full transition-shadow hover:shadow-psv-lg">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <ToolLogo logo={tool.logo} name={tool.name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{tool.name}</CardTitle>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {tool.comingSoon && (
                                  <Badge variant="secondary" className="text-xs">
                                    Binnenkort
                                  </Badge>
                                )}
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                              </div>
                            </div>
                            <CardDescription className="mt-0.5 text-xs">
                              {tool.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

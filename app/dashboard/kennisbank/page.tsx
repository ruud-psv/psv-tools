import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { kennisbankTools } from "@/lib/kennisbank";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Kennisbank | PSV Tools",
};

export default function KennisbankPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-3xl font-heading uppercase tracking-tight">
            Kennisbank
          </h1>
        </div>
        <p className="text-muted-foreground">
          Handleidingen en best practices voor alle tools en platforms die PSV
          gebruikt.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kennisbankTools.map((tool) => (
          <Link
            key={tool.slug}
            href={`/dashboard/kennisbank/${tool.slug}`}
            className="group block focus:outline-none"
          >
            <Card className="h-full transition-shadow hover:shadow-psv-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{tool.name}</CardTitle>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tool.comingSoon && (
                      <Badge variant="secondary" className="text-xs">
                        Binnenkort
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

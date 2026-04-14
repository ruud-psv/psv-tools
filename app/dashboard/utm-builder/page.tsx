import { UtmBuilderForm } from "@/components/utm-builder-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "UTM Builder | PSV Tools",
};

export default function UtmBuilderPage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">UTM Builder</h1>
        <p className="mt-1 text-muted-foreground">
          Genereer Google UTM-links voor campagnetracking.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe UTM-link</CardTitle>
          <CardDescription>
            Vul de URL en UTM-parameters in om een trackbare campagnelink te
            genereren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UtmBuilderForm />
        </CardContent>
      </Card>
    </div>
  );
}

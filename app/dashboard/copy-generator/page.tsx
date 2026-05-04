import { CopyGeneratorForm } from "@/components/copy-generator-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Mail tekst generator | PSV Tools",
};

export default function CopyGeneratorPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Mail tekst generator</h1>
        <p className="mt-1 text-muted-foreground">
          Genereer PSV e-mail copy en partner mailings met AI.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nieuw verzoek</CardTitle>
          <CardDescription>
            Vul de velden in om PSV teksten te genereren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyGeneratorForm />
        </CardContent>
      </Card>
    </div>
  );
}

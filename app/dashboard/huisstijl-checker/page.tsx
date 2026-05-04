import { HuisstijlCheckerForm } from "@/components/huisstijl-checker-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Huisstijl Checker | PSV Tools",
};

export default function HuisstijlCheckerPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Huisstijl Checker</h1>
        <p className="mt-1 text-muted-foreground">
          Laat je tekst controleren en corrigeren op basis van Het Rood-Witte
          Boekje.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tekst controleren</CardTitle>
          <CardDescription>
            Plak je tekst hieronder. De PSV Huisstijl Agent controleert spelling,
            eigennamen, notatie en schrijfstijl.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HuisstijlCheckerForm />
        </CardContent>
      </Card>
    </div>
  );
}

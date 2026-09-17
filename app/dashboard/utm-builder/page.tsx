import { UtmBuilder } from "@/components/utm-builder";

export const metadata = {
  title: "UTM Builder | PSV Tools",
};

export default function UtmBuilderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">UTM Builder</h1>
        <p className="mt-1 text-muted-foreground">
          Genereer Google UTM-links voor campagnetracking.
        </p>
      </div>

      <UtmBuilder />
    </div>
  );
}

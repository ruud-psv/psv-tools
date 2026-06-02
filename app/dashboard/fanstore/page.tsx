import { FANstoreDashboard } from "@/components/fanstore-dashboard";

export const metadata = {
  title: "FANstore | PSV Tools",
};

export default function FANstorePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">FANstore</h1>
      <p className="text-muted-foreground mb-6">
        Webshop inkomsten en productprestaties van de PSV FANstore via Google Analytics. Kies een periode en bekijk omzet, transacties en top producten.
      </p>
      <FANstoreDashboard />
    </div>
  );
}

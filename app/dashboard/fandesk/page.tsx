import { FANdeskDashboard } from "@/components/fandesk-dashboard";

export const metadata = {
  title: "FANdesk | PSV Tools",
};

export default function FANdeskPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">FANdesk</h1>
      <p className="text-muted-foreground mb-6">
        Statistieken over de binnengekomen support tickets. Kies een periode en bekijk hoeveel
        tickets er zijn binnengekomen, waar ze over gaan en op welke momenten ze binnenkomen.
      </p>
      <FANdeskDashboard />
    </div>
  );
}

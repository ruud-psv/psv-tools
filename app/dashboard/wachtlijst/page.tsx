import { Wachtlijst } from "@/components/wachtlijst";

export const metadata = {
  title: "Wachtlijst | PSV Tools",
};

/** Geen ingang in de sidebar: de pagina is alleen via de URL te bereiken, met login. */
export default function WachtlijstPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Wachtlijst />
    </div>
  );
}

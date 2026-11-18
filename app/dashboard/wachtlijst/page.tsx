import { Wachtlijst } from "@/components/wachtlijst";

export const metadata = {
  title: "Wachtlijst | PSV Tools",
};

/** In de sidebar onder Ticketing (`lib/navigation.ts`). */
export default function WachtlijstPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Wachtlijst />
    </div>
  );
}

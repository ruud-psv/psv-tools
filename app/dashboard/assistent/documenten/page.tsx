import { MijnDocumenten } from "@/components/mijn-documenten";

export const metadata = {
  title: "Mijn documenten | PSV Tools",
};

/** In de sidebar onder Assistent (`lib/navigation.ts`), met het recht van de assistent. */
export default function MijnDocumentenPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <MijnDocumenten />
    </div>
  );
}

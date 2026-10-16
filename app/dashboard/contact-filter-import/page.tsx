import { ContactFilterImport } from "@/components/contact-filter-import";

export const metadata = {
  title: "Contact Filter Import | PSV Tools",
};

export default function ContactFilterImportPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl">Contact Filter Import</h1>
          <span className="tag">Beta</span>
          <span className="tag tag--gold">Maileon</span>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          Zet een lijst relatienummers, SSO-ID&apos;s of GroupID&apos;s als contactfilter en doelgroep in Maileon.
          Maileon kent de contacten zelf al; alleen de ID&apos;s gaan erheen. De tool is nog in de testfase:
          controleer in Maileon of het aantal contacten klopt voordat je de doelgroep gebruikt.
        </p>
      </div>
      <ContactFilterImport />
    </div>
  );
}

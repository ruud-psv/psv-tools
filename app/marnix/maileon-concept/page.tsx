import { MaileonConcept } from "@/components/marnix/maileon-concept";

export const metadata = {
  title: "Maileon-concept | PSV Tools",
};

export default function MaileonConceptPage() {
  return (
    <>
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl">Maileon-concept</h1>
          <span className="tag">Test</span>
          <span className="tag tag--gold">Maileon</span>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Zet een mail uit de Mail Builder als concept in Maileon en krijg een voorbeeldlink voor de aanvrager.
          De mail wordt niet verstuurd of ingepland; de doelgroep en het inplannen doe je in Maileon.
        </p>
      </div>
      <MaileonConcept />
    </>
  );
}

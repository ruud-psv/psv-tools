import { MailBuilderForm } from "@/components/mail-builder-form";

export const metadata = {
  title: "Mail Builder | PSV Tools",
};

export default function MailBuilderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-4xl uppercase tracking-tight">
          Mail Builder
        </h1>
        <p className="mt-1 text-muted-foreground">
          Bouw Maileon-mails op basis van templates en huisstijl.
        </p>
      </div>
      <MailBuilderForm />
    </div>
  );
}

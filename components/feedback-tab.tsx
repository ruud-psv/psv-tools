const FEEDBACK_FORM_URL =
  "https://form.asana.com/?k=8cmANuEgVHFzoChIx2aRbw&d=1113382548430224";

/**
 * Rode feedbacktab die vast tegen de rechterrand staat, op elke pagina achter
 * de login. Op desktop een verticale tab met icoon en tekst (leest van onder
 * naar boven); onder `lg`, waar de sidebar inklapt, alleen het icoon.
 */
export function FeedbackTab() {
  return (
    <a
      href={FEEDBACK_FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 bg-psv-red-primary p-2.5 text-white shadow-psv-lg transition-colors hover:bg-psv-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:px-2 lg:py-3"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/psv/WHITE/ICON_PSV_white_chat.svg"
        alt=""
        width={20}
        height={20}
        className="h-5 w-5"
      />
      <span className="sr-only font-heading text-sm uppercase tracking-wide lg:not-sr-only lg:rotate-180 lg:[writing-mode:vertical-rl]">
        Feedback
      </span>
      <span className="sr-only">(opent in een nieuw tabblad)</span>
    </a>
  );
}

import { FansDashboard } from "@/components/fans/fans-dashboard";

export const metadata = {
  title: "Active & Engaged Fans | PSV Tools",
};

export default function FansPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl">Active &amp; Engaged Fans</h1>
          <span className="tag">Beta</span>
          <span className="tag tag--gold">Maileon</span>
          <span className="tag tag--gold">BlueConic</span>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          De twee fandoelen van dit seizoen. Een fan telt mee na een klik op een e-mail (Maileon) of een login op MijnPSV, zoals de
          PSV-app, PSV Play, de FANstore of Playable (BlueConic). Engaged Fans telt dat per maand, met het gemiddelde per maand als
          doel. Active Fans telt het over het hele seizoen sinds 1 juli, met het totaal op 30 juni als doel. Wie in beide bronnen
          voorkomt, telt één keer.
        </p>
      </div>
      <FansDashboard />
    </div>
  );
}

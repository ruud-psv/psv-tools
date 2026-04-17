import { WebVerkeerDashboard } from "@/components/web-verkeer-dashboard";

export const metadata = {
  title: "Web Verkeer | PSV Tools",
};

export default function WebVerkeerPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl mb-2">Web Verkeer</h1>
      <p className="text-muted-foreground mb-6">
        Verkeer en engagement van PSV websites via Google Analytics. Kies een
        periode en bekijk sessies, gebruikers, verkeersbronnen en meer.
      </p>
      <WebVerkeerDashboard />
    </div>
  );
}

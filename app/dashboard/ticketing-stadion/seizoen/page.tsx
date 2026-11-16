import { StadionSeizoen } from "@/components/stadion-seizoen";

export const metadata = {
  title: "Seizoen | Ticketing Stadion | PSV Tools",
};

export default function StadionSeizoenPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <StadionSeizoen />
    </div>
  );
}

import { KennisbankSidebar } from "@/components/kennisbank-sidebar";

export default function KennisbankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <KennisbankSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getAccess } from "@/lib/access-store";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // De middleware laat hier alleen geldige sessies door; de sidebar toont
  // alleen de pagina's waar deze gebruiker recht op heeft.
  const token = (await cookies()).get("psv_session")?.value;
  const session = token ? verifySession(token) : null;
  const access = session
    ? await getAccess(session.email)
    : { level: "custom" as const, isAdmin: false, pages: [] };

  return (
    <DashboardShell allowedPages={access.pages} isAdmin={access.isAdmin}>
      {children}
    </DashboardShell>
  );
}

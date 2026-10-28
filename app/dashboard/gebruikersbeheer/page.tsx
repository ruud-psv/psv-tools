import { UserManagement } from "@/components/user-management";

export const metadata = {
  title: "Gebruikersbeheer | PSV Tools",
};

// Alleen admins komen hier: de middleware stuurt de rest terug naar het dashboard.
export default function GebruikersbeheerPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Gebruikersbeheer</h1>
        <p className="mt-1 text-muted-foreground">
          Bepaal per collega welke pagina&apos;s zichtbaar zijn. Nieuwe collega&apos;s voeg je
          toe in de Azure portal; hier stel je in wat ze mogen zien.
        </p>
      </div>

      <UserManagement />
    </div>
  );
}

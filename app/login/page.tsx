import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-primary"
      style={{
        backgroundImage: "url('/images/background-image.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-[-40px] relative z-10">
          <Image
            src="/images/psv-logo.png"
            alt="PSV logo"
            width={180}
            height={180}
            priority
          />
        </div>
        <Card className="shadow-none">
          <CardHeader className="pt-12">
            <CardTitle>Beveiligde toegang</CardTitle>
            <CardDescription>
              Log in met je PSV Microsoft-account om verder te gaan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error === "saml_validation_failed" && (
              <p className="text-sm text-destructive">
                Inloggen mislukt. Probeer het opnieuw of neem contact op met beheer.
              </p>
            )}
            <a
              href="/api/auth/saml/login"
              className="flex w-full items-center justify-center gap-3 rounded-md bg-[#e82026] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#c00d0d] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              Inloggen met Microsoft
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

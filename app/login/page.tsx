"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const samlError = searchParams.get("error") === "saml_validation_failed";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Vul je gebruikersnaam en wachtwoord in.");
      return;
    }

    setLoading(true);
    const authHeader = `Basic ${btoa(`${username}:${password}`)}`;

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { Authorization: authHeader },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Inloggen mislukt.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggen mislukt.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CardContent className="space-y-4">
      {samlError && (
        <p className="text-sm text-destructive">
          Microsoft-login mislukt. Probeer het opnieuw of gebruik het formulier hieronder.
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
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">of</span>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Gebruiker</Label>
          <Input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Wachtwoord</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Bezig..." : "Inloggen"}
        </Button>
      </form>
    </CardContent>
  );
}

export default function LoginPage() {
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
        <Card className="shadow-lg">
          <CardHeader className="pt-12">
            <CardTitle>Beveiligde toegang</CardTitle>
            <CardDescription>
              Log in met je PSV Microsoft-account om verder te gaan.
            </CardDescription>
          </CardHeader>
          <Suspense>
            <LoginForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}

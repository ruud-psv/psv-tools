"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function LoginPage() {
  const router = useRouter();
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
              Log in om PSV Tools te gebruiken.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
        </Card>
      </div>
    </div>
  );
}

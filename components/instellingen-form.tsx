"use client";

import { useState, useEffect } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SettingsState {
  anthropicApiKeySet: boolean;
  anthropicApiKey: string | null;
  fromEnv: boolean;
}

export function InstellingenForm() {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => setError("Kon instellingen niet laden."));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setSaveStatus("saving");
    setError("");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: keyInput.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Opslaan mislukt.");
        setSaveStatus("error");
        return;
      }

      setSaveStatus("saved");
      setKeyInput("");
      // Refresh displayed status
      const updated = await fetch("/api/settings").then((r) => r.json());
      setSettings(updated);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setError("Kon de server niet bereiken.");
      setSaveStatus("error");
    }
  }

  if (!settings && !error) {
    return <p className="text-sm text-muted-foreground">Laden...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Anthropic API-sleutel</CardTitle>
            {settings?.anthropicApiKeySet ? (
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" />
                Ingesteld
              </Badge>
            ) : (
              <Badge variant="outline">Niet ingesteld</Badge>
            )}
          </div>
          <CardDescription>
            Vereist voor de Rapportage generator. Haal je sleutel op via{" "}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              console.anthropic.com
            </a>{" "}
            → API Keys.
            {settings?.fromEnv && (
              <span className="block mt-1 text-xs text-muted-foreground">
                Momenteel ingesteld via omgevingsvariabele (ANTHROPIC_API_KEY).
              </span>
            )}
            {settings?.anthropicApiKeySet && !settings.fromEnv && settings.anthropicApiKey && (
              <span className="block mt-1 text-xs font-mono text-muted-foreground">
                Huidige sleutel: {settings.anthropicApiKey}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="api-key">
                {settings?.anthropicApiKeySet ? "Nieuwe sleutel invoeren" : "API-sleutel"}
              </Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="pr-10 font-mono text-sm"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              disabled={!keyInput.trim() || saveStatus === "saving"}
              className="gap-2"
            >
              {saveStatus === "saving" ? (
                "Opslaan..."
              ) : saveStatus === "saved" ? (
                <>
                  <Check className="h-4 w-4" />
                  Opgeslagen
                </>
              ) : (
                "Opslaan"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileSpreadsheet, RotateCcw, TrendingUp, TrendingDown, Minus, Pencil, Send, FileDown, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

interface KPI {
  label: string;
  value: string;
  change?: string;
}

interface ChartSpec {
  type: "bar" | "line" | "pie";
  title: string;
  dataKey: string;
  categoryKey: string;
  data: Record<string, unknown>[];
}

interface AnalysisResult {
  reportType: string;
  title: string;
  summary: string;
  kpis: KPI[];
  charts: ChartSpec[];
  insights: string[];
}

interface PiiMatch {
  label: string;
  examples: string[];
}

const PII_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "E-mailadressen",
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
  {
    label: "Telefoonnummers",
    pattern: /(?:\+31|0031|0)[.\- ]?(?:6[.\- ]?\d{8}|[1-9]\d(?:[.\- ]?\d){6,7})/g,
  },
  {
    label: "IBAN-bankrekeningnummers",
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,}\b/g,
  },
  {
    label: "Burgerservicenummers (BSN)",
    pattern: /\b\d{9}\b/g,
  },
  {
    label: "Postcodes (mogelijk adresgegevens)",
    pattern: /\b[1-9]\d{3}\s?[A-Z]{2}\b/g,
  },
  {
    label: "Straatnamen met huisnummers",
    pattern: /[A-Z][a-zÀ-ÿ]+(?:straat|laan|weg|plein|kade|gracht|dreef|singel|dijk|pad|steeg|hof|allee)\s+\d+/gi,
  },
];

function detectPii(result: AnalysisResult): PiiMatch[] {
  const text = [
    result.title ?? "",
    result.summary ?? "",
    ...(result.insights ?? []),
    ...(result.kpis ?? []).map((k) => `${k.label} ${k.value} ${k.change ?? ""}`),
    ...(result.charts ?? []).map((c) => c.title),
  ].join(" ");

  return PII_PATTERNS.flatMap(({ label, pattern }) => {
    const matches = [...text.matchAll(pattern)].map((m) => m[0]);
    if (matches.length === 0) return [];
    const examples = [...new Set(matches)].slice(0, 3);
    return [{ label, examples }];
  });
}

const CHART_COLORS = [
  "hsl(358, 81%, 52%)",
  "hsl(215, 70%, 50%)",
  "hsl(142, 60%, 45%)",
  "hsl(45, 90%, 55%)",
  "hsl(280, 65%, 55%)",
  "hsl(195, 75%, 50%)",
];

const PROGRESS_DURATION = 45_000;

function useProgressBar(running: boolean) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      setProgress(0);
      const start = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - start;
        setProgress(Math.min(99, (elapsed / PROGRESS_DURATION) * 100));
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  return progress;
}

// Inline editable single-line text
function EditableText({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={cn(
          "bg-transparent border-b border-primary outline-none w-full",
          className
        )}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Klik om te bewerken"
      className={cn(
        "cursor-text group-hover:underline group-hover:decoration-dashed decoration-muted-foreground",
        className
      )}
    >
      {value}
    </span>
  );
}

// Inline editable multi-line text
function EditableArea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={cn(
          "bg-transparent border-b border-primary outline-none w-full resize-none leading-relaxed",
          className
        )}
      />
    );
  }

  return (
    <p
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Klik om te bewerken"
      className={cn("cursor-text leading-relaxed hover:underline hover:decoration-dashed decoration-muted-foreground", className)}
    >
      {value}
    </p>
  );
}

function KPICard({ kpi, onUpdate }: { kpi: KPI; onUpdate: (updated: KPI) => void }) {
  const isPositive = kpi.change?.startsWith("+");
  const isNegative = kpi.change?.startsWith("-");

  return (
    <Card className="group">
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground mb-1">
          <EditableText
            value={kpi.label}
            onChange={(v) => onUpdate({ ...kpi, label: v })}
            className="text-xs text-muted-foreground"
          />
        </p>
        <p className="text-2xl font-bold">
          <EditableText
            value={kpi.value}
            onChange={(v) => onUpdate({ ...kpi, value: v })}
            className="text-2xl font-bold"
          />
        </p>
        {kpi.change && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${
              isPositive ? "text-green-600" : isNegative ? "text-red-600" : "text-muted-foreground"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3 flex-shrink-0" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3 flex-shrink-0" />
            ) : (
              <Minus className="h-3 w-3 flex-shrink-0" />
            )}
            <EditableText
              value={kpi.change}
              onChange={(v) => onUpdate({ ...kpi, change: v })}
            />
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ chart }: { chart: ChartSpec }) {
  const data = chart.data ?? [];

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{chart.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          {chart.type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={chart.dataKey}
                nameKey={chart.categoryKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : chart.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={chart.categoryKey} tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey={chart.dataKey} stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey={chart.categoryKey} tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey={chart.dataKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function RapportageGeneratorForm() {
  const [file, setFile] = useState<File | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [refineInput, setRefineInput] = useState("");
  const [refineStatus, setRefineStatus] = useState<"idle" | "loading" | "error">("idle");
  const [refineError, setRefineError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [piiWarnings, setPiiWarnings] = useState<PiiMatch[]>([]);
  const [piiDismissed, setPiiDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const progress = useProgressBar(status === "loading");

  const exportPdf = useCallback(async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeightMm = (canvas.height / canvas.width) * pageWidth;

      let heightLeft = imgHeightMm;
      let offsetY = 0;

      pdf.addImage(imgData, "PNG", 0, offsetY, pageWidth, imgHeightMm);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        offsetY -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, offsetY, pageWidth, imgHeightMm);
        heightLeft -= pageHeight;
      }

      const filename = result?.title
        ? `${result.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`
        : "rapportage.pdf";
      pdf.save(filename);
    } finally {
      setIsExporting(false);
    }
  }, [result]);

  const handleFile = useCallback((f: File) => {
    const validExtensions = [".xlsx", ".xls"];
    if (!validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setError("Ongeldig bestandstype. Upload een .xlsx of .xls bestand.");
      return;
    }
    setFile(f);
    setError("");
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }

  async function handleSubmit() {
    if (!file) return;
    setStatus("loading");
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (promptInput.trim()) formData.append("prompt", promptInput.trim());

    try {
      const res = await fetch("/api/analyze-report", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Er is een fout opgetreden."); setStatus("error"); return; }
      const analysisResult = data as AnalysisResult;
      setResult(analysisResult);
      setPiiWarnings(detectPii(analysisResult));
      setPiiDismissed(false);
      setStatus("done");
    } catch {
      setError("Kon de server niet bereiken. Probeer het opnieuw.");
      setStatus("error");
    }
  }

  function handleReset() {
    setFile(null);
    setPromptInput("");
    setStatus("idle");
    setResult(null);
    setError("");
    setPiiWarnings([]);
    setPiiDismissed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleRefine(e: React.FormEvent) {
    e.preventDefault();
    if (!refineInput.trim() || !result) return;
    setRefineStatus("loading");
    setRefineError("");

    try {
      const res = await fetch("/api/refine-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentResult: result, prompt: refineInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setRefineError(data.error ?? "Er is een fout opgetreden."); setRefineStatus("error"); return; }
      const refinedResult = data as AnalysisResult;
      setResult(refinedResult);
      setPiiWarnings(detectPii(refinedResult));
      setPiiDismissed(false);
      setRefineInput("");
      setRefineStatus("idle");
    } catch {
      setRefineError("Kon de server niet bereiken.");
      setRefineStatus("error");
    }
  }

  function updateKPI(index: number, updated: KPI) {
    if (!result) return;
    const kpis = [...result.kpis];
    kpis[index] = updated;
    setResult({ ...result, kpis });
  }

  function updateInsight(index: number, value: string) {
    if (!result) return;
    const insights = [...result.insights];
    insights[index] = value;
    setResult({ ...result, insights });
  }

  // Upload state
  if (status === "idle" || status === "error") {
    return (
      <div className="space-y-4 max-w-2xl">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-accent/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">Sleep een Excel bestand hierheen, of klik om te uploaden</p>
          <p className="text-xs text-muted-foreground">.xlsx of .xls</p>
        </div>

        {file && (
          <div className="flex items-center gap-3 rounded-md border bg-accent/30 px-4 py-3">
            <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleReset(); }}>
              Verwijderen
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="prompt" className="text-sm font-medium">
            Specifieke inzichten <span className="text-muted-foreground font-normal">(optioneel)</span>
          </Label>
          <Textarea
            id="prompt"
            placeholder="Bijv. focus op de open rates per doelgroep, of vergelijk de prestaties van campagnes uit Q1 en Q2..."
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
            {error}
          </p>
        )}

        <Button onClick={handleSubmit} disabled={!file} className="w-full">
          Analyseer bestand
        </Button>
      </div>
    );
  }

  // Loading state
  if (status === "loading") {
    return (
      <Card className="max-w-2xl">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground truncate">{file?.name}</p>
          </div>
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">Claude analyseert de data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Done state
  if (status === "done" && result) {
    return (
      <div className="space-y-6">
        {/* PII warning */}
        {piiWarnings.length > 0 && !piiDismissed && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Mogelijk persoonsgegevens gevonden</p>
                  <p className="text-xs text-amber-800">
                    Controleer de rapportage vóór het exporteren of delen. Gevonden in:
                  </p>
                  <ul className="text-xs text-amber-800 space-y-0.5">
                    {piiWarnings.map((w) => (
                      <li key={w.label} className="flex items-start gap-1">
                        <span className="font-medium">{w.label}:</span>
                        <span className="font-mono">{w.examples.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={() => setPiiDismissed(true)}
                className="text-amber-600 hover:text-amber-900 flex-shrink-0"
                aria-label="Sluit melding"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={isExporting} className="flex-shrink-0">
            <FileDown className="h-4 w-4 mr-2" />
            {isExporting ? "Exporteren..." : "Exporteer als PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="flex-shrink-0">
            <RotateCcw className="h-4 w-4 mr-2" />
            Nieuw bestand
          </Button>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Pencil className="h-3 w-3" />
          Klik op tekst om te bewerken
        </p>

        {/* Exportable content */}
        <div ref={reportRef} className="space-y-6 bg-white rounded-lg p-6">
          {/* Title */}
          <div className="group min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">
                <EditableText
                  value={result.title}
                  onChange={(v) => setResult({ ...result, title: v })}
                  className="text-xl font-bold"
                />
              </h2>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Gebaseerd op {file?.name}</p>
          </div>

          <Separator />

          {/* Summary */}
          {result.summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Samenvatting</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableArea
                  value={result.summary}
                  onChange={(v) => setResult({ ...result, summary: v })}
                  className="text-sm"
                />
              </CardContent>
            </Card>
          )}

          {/* Insights */}
          {result.insights?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Inzichten</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm group">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                      <EditableArea
                        value={insight}
                        onChange={(v) => updateInsight(i, v)}
                        className="text-sm flex-1"
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* KPIs */}
          {result.kpis?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Kerncijfers</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {result.kpis.map((kpi, i) => (
                  <KPICard key={i} kpi={kpi} onUpdate={(updated) => updateKPI(i, updated)} />
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {result.charts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Visualisaties</h3>
              <div className="grid grid-cols-1 gap-4">
                {result.charts.map((chart, i) => (
                  <ChartCard key={i} chart={chart} />
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Follow-up prompt */}
        <form onSubmit={handleRefine} className="space-y-3 max-w-2xl">
          <div className="space-y-1.5">
            <Label htmlFor="refine" className="text-sm font-medium">Opdracht of aanpassing</Label>
            <Textarea
              id="refine"
              placeholder="Bijv. voeg een grafiek toe voor de CTR per week, pas de samenvatting aan, of bereken de gemiddelde open rate..."
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              rows={3}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRefine(e as unknown as React.FormEvent);
              }}
            />
          </div>
          {refineError && (
            <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
              {refineError}
            </p>
          )}
          <Button type="submit" disabled={!refineInput.trim() || refineStatus === "loading"} className="gap-2">
            {refineStatus === "loading" ? (
              "Verwerken..."
            ) : (
              <>
                <Send className="h-4 w-4" />
                Verwerk opdracht
              </>
            )}
          </Button>
        </form>
      </div>
    );
  }

  return null;
}

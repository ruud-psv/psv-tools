"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileSpreadsheet, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
        const pct = Math.min(99, (elapsed / PROGRESS_DURATION) * 100);
        setProgress(pct);
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  return progress;
}

function KPICard({ kpi }: { kpi: KPI }) {
  const isPositive = kpi.change?.startsWith("+");
  const isNegative = kpi.change?.startsWith("-");

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
        <p className="text-2xl font-bold">{kpi.value}</p>
        {kpi.change && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${
              isPositive
                ? "text-green-600"
                : isNegative
                ? "text-red-600"
                : "text-muted-foreground"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {kpi.change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ chart }: { chart: ChartSpec }) {
  const data = chart.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{chart.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          {chart.type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={chart.dataKey}
                nameKey={chart.categoryKey}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : chart.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey={chart.categoryKey}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={chart.dataKey}
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border"
              />
              <XAxis
                dataKey={chart.categoryKey}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar
                dataKey={chart.dataKey}
                fill={CHART_COLORS[0]}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function RapportageGeneratorForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progress = useProgressBar(status === "loading");

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

    try {
      const res = await fetch("/api/analyze-report", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Er is een fout opgetreden.");
        setStatus("error");
        return;
      }

      setResult(data as AnalysisResult);
      setStatus("done");
    } catch {
      setError("Kon de server niet bereiken. Probeer het opnieuw.");
      setStatus("error");
    }
  }

  function handleReset() {
    setFile(null);
    setStatus("idle");
    setResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Upload state
  if (status === "idle" || status === "error") {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
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
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">
            Sleep een Excel bestand hierheen, of klik om te uploaden
          </p>
          <p className="text-xs text-muted-foreground">.xlsx of .xls</p>
        </div>

        {file && (
          <div className="flex items-center gap-3 rounded-md border bg-accent/30 px-4 py-3">
            <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Verwijderen
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
            {error}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!file}
          className="w-full"
        >
          Analyseer bestand
        </Button>
      </div>
    );
  }

  // Loading state
  if (status === "loading") {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground truncate">{file?.name}</p>
          </div>
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Claude analyseert de data...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Done state
  if (status === "done" && result) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{result.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gebaseerd op {file?.name}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Nieuw bestand
          </Button>
        </div>

        <Separator />

        {/* KPIs */}
        {result.kpis?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Kerncijfers
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {result.kpis.map((kpi, i) => (
                <KPICard key={i} kpi={kpi} />
              ))}
            </div>
          </div>
        )}

        {/* Charts */}
        {result.charts?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Visualisaties
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {result.charts.map((chart, i) => (
                <ChartCard key={i} chart={chart} />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {result.summary && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Samenvatting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{result.summary}</p>
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
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    {insight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return null;
}

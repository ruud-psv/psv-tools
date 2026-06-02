"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ShoppingBag,
  TrendingUp,
  ShoppingCart,
  Package,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FANstoreData, ProductTrendData } from "@/app/api/fanstore-analytics/route";

type Period = "7d" | "30d" | "90d" | "custom";

const PERIOD_LABELS: Record<Exclude<Period, "custom">, string> = {
  "7d": "7 dagen",
  "30d": "30 dagen",
  "90d": "90 dagen",
};

function formatEuro(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatEuroFull(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("nl-NL").format(value);
}

// Convert "psv-eindhoven-shirt-rood" → "Psv Eindhoven Shirt Rood"
function formatProductName(name: string): string {
  if (!name || name === "(onbekend)") return name;
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-heading uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const TOOLTIP_STYLE = "bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-md";

export function FANstoreDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<FANstoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Product detail state
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productTrend, setProductTrend] = useState<ProductTrendData | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  const buildUrl = useCallback(
    (p: Period, cs: string, ce: string) => {
      if (p === "custom" && cs && ce) {
        return `/api/fanstore-analytics?period=custom&startDate=${cs}&endDate=${ce}`;
      }
      return `/api/fanstore-analytics?period=${p}`;
    },
    []
  );

  const fetchData = useCallback(
    async (p: Period, cs = customStart, ce = customEnd) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(p, cs, ce));
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Onbekende fout bij ophalen data.");
          setData(null);
        } else {
          setData(json);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Netwerkfout.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [buildUrl, customStart, customEnd]
  );

  useEffect(() => {
    if (period !== "custom") fetchData(period);
  }, [period, fetchData]);

  const fetchProductTrend = useCallback(
    async (productName: string) => {
      setProductLoading(true);
      setProductError(null);
      setProductTrend(null);
      try {
        const base = buildUrl(period, customStart, customEnd);
        const url = `${base}&product=${encodeURIComponent(productName)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) {
          setProductError(json.error ?? "Onbekende fout.");
        } else {
          setProductTrend(json);
        }
      } catch (e) {
        setProductError(e instanceof Error ? e.message : "Netwerkfout.");
      } finally {
        setProductLoading(false);
      }
    },
    [buildUrl, period, customStart, customEnd]
  );

  function handleProductClick(rawName: string) {
    setSelectedProduct(rawName);
    fetchProductTrend(rawName);
  }

  function handleBack() {
    setSelectedProduct(null);
    setProductTrend(null);
    setProductError(null);
  }

  const trendData = (data?.dailyTrend ?? []).map((d) => ({
    ...d,
    dateLabel: d.date.slice(5),
  }));

  const topProducts = data?.topProducts.slice(0, 10) ?? [];
  const topCategories = data?.topCategories ?? [];

  // ── Product detail view ─────────────────────────────────────────────────────
  if (selectedProduct !== null) {
    const trendRows = (productTrend?.dailyTrend ?? []).map((d) => ({
      ...d,
      dateLabel: d.date.slice(5),
    }));
    const totalProductRevenue = trendRows.reduce((s, r) => s + r.revenue, 0);
    const totalProductItems = trendRows.reduce((s, r) => s + r.itemsPurchased, 0);

    return (
      <div className="space-y-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar overzicht
        </button>

        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            {formatProductName(selectedProduct)}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Productprestaties over de geselecteerde periode
          </p>
        </div>

        {productError && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-4 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{productError}</span>
          </div>
        )}

        {productLoading ? (
          <div className="bg-card border border-border rounded-lg p-4 h-64 animate-pulse" />
        ) : productTrend ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <KpiCard
                icon={ShoppingBag}
                label="Omzet (periode)"
                value={formatEuro(totalProductRevenue)}
              />
              <KpiCard
                icon={Package}
                label="Verkochte items"
                value={formatNumber(totalProductItems)}
              />
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-heading uppercase tracking-wide text-muted-foreground mb-4">
                Omzet per dag
              </h3>
              {trendRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen data voor deze periode.</p>
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <LineChart data={trendRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" strokeOpacity={0.2} />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fill: "#888", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="rev"
                      orientation="left"
                      tick={{ fill: "#888", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `€${v}`}
                      width={52}
                    />
                    <YAxis
                      yAxisId="items"
                      orientation="right"
                      tick={{ fill: "#888", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                    />
                    <Tooltip
                      content={({ active, payload, label: lbl }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className={TOOLTIP_STYLE}>
                            <p className="text-gray-500 mb-1">{lbl}</p>
                            {payload.map((e, i) => (
                              <p key={i} style={{ color: e.color as string }}>
                                {e.name}: {e.name === "Omzet" ? formatEuroFull(e.value as number) : formatNumber(e.value as number)}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Line
                      yAxisId="rev"
                      type="monotone"
                      dataKey="revenue"
                      name="Omzet"
                      stroke="#e82026"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="items"
                      type="monotone"
                      dataKey="itemsPurchased"
                      name="Verkocht"
                      stroke="#bb9753"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#e82026] inline-block" />
                  Omzet
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#bb9753] inline-block" />
                  Verkocht (stuks)
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ── Main dashboard ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Periode-selector */}
      <div className="flex flex-wrap items-end gap-2">
        {(["7d", "30d", "90d"] as Exclude<Period, "custom">[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "px-3 py-1.5 rounded text-sm font-heading uppercase tracking-wide transition-colors",
              period === p
                ? "bg-[#e82026] text-white"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}

        {/* Custom datumbereik */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className={cn(
              "bg-card border border-border rounded px-2 py-1.5 text-sm text-foreground transition-colors",
              period === "custom" && "border-[#e82026]"
            )}
          />
          <span className="text-muted-foreground text-sm">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className={cn(
              "bg-card border border-border rounded px-2 py-1.5 text-sm text-foreground transition-colors",
              period === "custom" && "border-[#e82026]"
            )}
          />
          <button
            onClick={() => {
              if (customStart && customEnd) {
                setPeriod("custom");
                fetchData("custom", customStart, customEnd);
              }
            }}
            disabled={!customStart || !customEnd}
            className="px-3 py-1.5 rounded text-sm font-heading uppercase tracking-wide bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Toepassen
          </button>
        </div>

        <button
          onClick={() => fetchData(period)}
          className="ml-auto p-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Vernieuwen"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Foutmelding */}
      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-4 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI's */}
      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={ShoppingBag} label="Totale omzet" value={formatEuro(data.totals.revenue)} />
          <KpiCard icon={ShoppingCart} label="Transacties" value={formatNumber(data.totals.transactions)} sub="Voltooide bestellingen" />
          <KpiCard icon={TrendingUp} label="Gem. orderwaarde" value={formatEuroFull(data.totals.avgOrderValue)} sub="Per bestelling" />
          <KpiCard icon={Package} label="Verkochte items" value={formatNumber(data.totals.itemsPurchased)} sub="Totaal producten" />
        </div>
      ) : null}

      {data && (
        <>
          {/* Dagelijkse omzettrend */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-heading uppercase tracking-wide text-muted-foreground mb-4">
              Dagelijkse omzettrend
            </h2>
            <ResponsiveContainer width="100%" height={224}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" strokeOpacity={0.2} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fill: "#888", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="left"
                  tick={{ fill: "#888", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                  width={48}
                />
                <YAxis
                  yAxisId="transactions"
                  orientation="right"
                  tick={{ fill: "#888", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  content={({ active, payload, label: lbl }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className={TOOLTIP_STYLE}>
                        <p className="text-gray-500 mb-1">{lbl}</p>
                        {payload.map((e, i) => (
                          <p key={i} style={{ color: e.color as string }}>
                            {e.name}: {e.name === "Omzet" ? formatEuroFull(e.value as number) : formatNumber(e.value as number)}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Omzet" stroke="#e82026" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="transactions" type="monotone" dataKey="transactions" name="Transacties" stroke="#bb9753" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#e82026] inline-block" />Omzet</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#bb9753] inline-block" />Transacties</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top producten */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-sm font-heading uppercase tracking-wide text-muted-foreground mb-1">
                Top producten op omzet
              </h2>
              <p className="text-xs text-muted-foreground mb-4">Klik op een product voor detail</p>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen productdata beschikbaar.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, topProducts.length * 28)}>
                  <BarChart
                    data={topProducts.map((p) => ({ ...p, displayName: formatProductName(p.name) }))}
                    layout="vertical"
                    margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                    onClick={(state: unknown) => {
                      const s = state as { activePayload?: { payload?: { name?: string } }[] } | null;
                      const name = s?.activePayload?.[0]?.payload?.name;
                      if (name) handleProductClick(name);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" strokeOpacity={0.2} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#888", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="displayName"
                      tick={{ fill: "#ccc", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={140}
                      tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const product = payload[0]?.payload;
                        return (
                          <div className={cn(TOOLTIP_STYLE, "max-w-[220px]")}>
                            <p className="text-gray-700 font-medium mb-1 break-words">
                              {formatProductName(product?.name ?? "")}
                            </p>
                            <p style={{ color: "#e82026" }}>
                              Omzet: {formatEuroFull(product?.revenue ?? 0)}
                            </p>
                            <p className="text-gray-500">
                              Verkocht: {formatNumber(product?.itemsPurchased ?? 0)} stuks
                            </p>
                            <p className="text-gray-400 mt-1 text-[10px]">Klik voor detail →</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="revenue" name="Omzet" radius={[0, 3, 3, 0]}>
                      {topProducts.map((_, index) => (
                        <Cell key={index} fill={index === 0 ? "#e82026" : index < 3 ? "#c00d0d" : "#7a2020"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Omzet per categorie */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-sm font-heading uppercase tracking-wide text-muted-foreground mb-4">
                Omzet per categorie
              </h2>
              {topCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen categoriedata beschikbaar.</p>
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart
                    data={topCategories.map((c) => ({ ...c, displayCategory: formatProductName(c.category) }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" strokeOpacity={0.2} />
                    <XAxis
                      dataKey="displayCategory"
                      tick={{ fill: "#ccc", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)}
                    />
                    <YAxis
                      tick={{ fill: "#888", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                      width={48}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const cat = payload[0]?.payload;
                        return (
                          <div className={TOOLTIP_STYLE}>
                            <p className="text-gray-700 font-medium mb-1">{formatProductName(cat?.category ?? "")}</p>
                            <p style={{ color: "#e82026" }}>Omzet: {formatEuroFull(cat?.revenue ?? 0)}</p>
                            <p className="text-gray-500">Items: {formatNumber(cat?.transactions ?? 0)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="revenue" name="Omzet" fill="#e82026" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Producten tabel */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-heading uppercase tracking-wide text-muted-foreground mb-4">
              Productdetails — top {topProducts.length}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-heading uppercase text-xs tracking-wide text-muted-foreground">#</th>
                    <th className="pb-2 pr-4 font-heading uppercase text-xs tracking-wide text-muted-foreground">Product</th>
                    <th className="pb-2 pr-4 font-heading uppercase text-xs tracking-wide text-muted-foreground text-right">Omzet</th>
                    <th className="pb-2 font-heading uppercase text-xs tracking-wide text-muted-foreground text-right">Verkocht</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => handleProductClick(product.name)}
                    >
                      <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4 text-foreground hover:text-[#e82026] transition-colors">
                        {formatProductName(product.name)}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-[#e82026]">
                        {formatEuroFull(product.revenue)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {formatNumber(product.itemsPurchased)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

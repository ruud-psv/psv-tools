"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { PaidAdsInsightResult } from "@/lib/insights/paid-ads";

function highlightIcon(type: string) {
  switch (type) {
    case "achievement":
      return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />;
    case "warning":
      return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
    case "anomaly":
      return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />;
    default:
      return <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-info" />;
  }
}

export interface InsightsPanelProps {
  insights: PaidAdsInsightResult | null;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  periodLabel: string;
  onAnalyze: () => void;
  onAsk: (question: string) => void;
  answer: string | null;
  answerLoading: boolean;
  answerError: string | null;
}

export function InsightsPanel({
  insights,
  loading,
  error,
  hasData,
  periodLabel,
  onAnalyze,
  onAsk,
  answer,
  answerLoading,
  answerError,
}: InsightsPanelProps) {
  const [question, setQuestion] = useState("");

  function submitQuestion(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !hasData || answerLoading) return;
    onAsk(trimmed);
    setQuestion("");
  }

  const ask = (
    <form onSubmit={submitQuestion} className="mt-4 border-t border-border pt-4">
      <p className="mb-2 font-heading text-[10px] uppercase tracking-wider text-muted-foreground">
        Stel een vraag
      </p>
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!hasData || answerLoading}
          placeholder="Bijv. welke campagne levert de goedkoopste conversies over alle platformen?"
        />
        <Button type="submit" size="icon" disabled={!hasData || answerLoading || !question.trim()}>
          {answerLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </Button>
      </div>
      {answerError && <p className="mt-2 text-xs text-destructive">{answerError}</p>}
      {answer && (
        <p className="mt-3 whitespace-pre-wrap border-l-2 border-psv-red-primary pl-3 text-sm text-muted-foreground">
          {answer}
        </p>
      )}
    </form>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-psv-gold" />
          <span className="text-sm text-muted-foreground">AI-inzichten worden gegenereerd…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">Analyse mislukt</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onAnalyze}>
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 shrink-0 text-psv-gold" />
              <div>
                <p className="text-sm font-medium">AI Inzichten</p>
                <p className="text-xs text-muted-foreground">
                  {hasData
                    ? `Laat het model patronen, anomalieën en aanbevelingen analyseren voor ${periodLabel.toLowerCase()}.`
                    : "Beschikbaar zodra er campagnedata is opgehaald."}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onAnalyze} disabled={!hasData} className="shrink-0">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Analyseren
            </Button>
          </div>
          {ask}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-psv-gold" />
          AI Inzichten
          <span className="ml-1 text-xs font-normal normal-case tracking-normal text-muted-foreground">
            {periodLabel}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">{insights.summary}</p>

        {insights.highlights?.length > 0 && (
          <ul className="mt-4 space-y-2">
            {insights.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {highlightIcon(h.type)}
                <span className="text-muted-foreground">{h.text}</span>
              </li>
            ))}
          </ul>
        )}

        {(insights.bestPerformer || insights.attentionNeeded) && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {insights.bestPerformer && (
              <div className="border border-border bg-success-bg/60 p-3">
                <p className="font-heading text-[10px] uppercase tracking-wider text-success">
                  Best presterend
                </p>
                <p className="mt-1 text-sm font-semibold">{insights.bestPerformer.name}</p>
                <p className="text-xs text-muted-foreground">{insights.bestPerformer.metric}</p>
                <p className="mt-1 text-xs text-muted-foreground">{insights.bestPerformer.why}</p>
              </div>
            )}
            {insights.attentionNeeded && (
              <div className="border border-border bg-warning-bg/60 p-3">
                <p className="font-heading text-[10px] uppercase tracking-wider text-warning">
                  Vraagt aandacht
                </p>
                <p className="mt-1 text-sm font-semibold">{insights.attentionNeeded.name}</p>
                <p className="text-xs text-muted-foreground">{insights.attentionNeeded.metric}</p>
                <p className="mt-1 text-xs text-muted-foreground">{insights.attentionNeeded.action}</p>
              </div>
            )}
          </div>
        )}

        {insights.recommendations?.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 font-heading text-[10px] uppercase tracking-wider text-muted-foreground">
              Aanbevelingen
            </p>
            <ul className="space-y-1.5">
              {insights.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-psv-red-primary" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ask}
      </CardContent>
    </Card>
  );
}

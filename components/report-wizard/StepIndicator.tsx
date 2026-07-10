"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  key: string;
  label: string;
}

export function StepIndicator({
  steps, current, furthest, onStepClick,
}: {
  steps: WizardStep[];
  current: number;
  /** Hoogst bereikte stap — stappen t/m deze index zijn klikbaar. */
  furthest: number;
  onStepClick: (index: number) => void;
}) {
  return (
    <nav aria-label="Stappen" className="mb-8">
      <ol className="flex items-center">
        {steps.map((step, i) => {
          const isDone = i < current;
          const isActive = i === current;
          const reachable = i <= furthest;
          return (
            <li key={step.key} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => reachable && onStepClick(i)}
                disabled={!reachable}
                className={cn(
                  "flex items-center gap-2.5 text-left",
                  reachable ? "cursor-pointer" : "cursor-not-allowed"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm font-heading transition-colors",
                    isActive && "border-psv-red-primary bg-psv-red-primary text-white",
                    isDone && "border-psv-red-primary bg-psv-red-primary/10 text-psv-red-primary",
                    !isActive && !isDone && "border-border bg-background text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-heading uppercase tracking-wide sm:block",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded transition-colors",
                    i < current ? "bg-psv-red-primary" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

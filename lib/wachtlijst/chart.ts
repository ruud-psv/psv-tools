/**
 * Hulp voor de grafieken van het verloop. Puur, zodat de tests het direct
 * kunnen gebruiken.
 *
 * De wachtlijst is in één klap gevuld toen hij openging. Een grafiek vanaf nul
 * en vanaf de eerste dag laat dan alleen die sprong zien; alles daarna is een
 * vlakke lijn. Daarom: de grafieken beginnen na de start (`launchCut()`) en de
 * as van de omvang zoomt in op het bereik van de data (`zoomDomain()`).
 */

import type { DayPoint } from "./analysis";

/**
 * De index van de laatste dag van de start: de laatste dag in het eerste
 * vijfde deel van de periode waarop minstens 5% van de hoogste stand in één
 * dag instroomde. De start kan over meer dagen verspreid zijn (opening op de
 * avond, de rest de dag erna). `-1` als er geen start is: de lijst groeide
 * geleidelijk.
 */
export function launchCut(days: readonly DayPoint[]): number {
  const highest = days.reduce((max, day) => Math.max(max, day.size), 0);
  if (highest === 0 || days.length < 10) return -1;
  let last = -1;
  for (let index = 0; index <= days.length / 5; index++) {
    if (days[index].joined >= highest * 0.05) last = index;
  }
  return last;
}

/** Een as die niet bij nul begint maar om de waarden heen ligt, op ronde getallen. */
export function zoomDomain(values: readonly number[]): [number, number] {
  if (!values.length) return [0, 1];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = Math.max(high - low, 1);
  const rough = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10) * magnitude, 1);
  const bottom = Math.max(Math.floor((low - range * 0.05) / step) * step, 0);
  const top = Math.ceil((high + range * 0.05) / step) * step;
  return [bottom, top];
}

export interface PeriodPoint {
  /** De eerste dag van de periode (`YYYY-MM-DD`). */
  start: string;
  days: number;
  joined: number;
  left: number;
}

function mondayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Instroom en uitstroom per week (maandag tot en met zondag). Bij zes weken of korter per dag. */
export function groupPeriods(days: readonly DayPoint[]): { unit: "dag" | "week"; points: PeriodPoint[] } {
  if (days.length <= 42) {
    return { unit: "dag", points: days.map((day) => ({ start: day.day, days: 1, joined: day.joined, left: day.left })) };
  }
  const points: PeriodPoint[] = [];
  for (const day of days) {
    const monday = mondayOf(day.day);
    const last = points[points.length - 1];
    if (last && mondayOf(last.start) === monday) {
      last.days++;
      last.joined += day.joined;
      last.left += day.left;
    } else {
      points.push({ start: day.day, days: 1, joined: day.joined, left: day.left });
    }
  }
  return { unit: "week", points };
}

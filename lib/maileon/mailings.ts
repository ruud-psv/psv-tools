/**
 * Verzonden mailings en hun resultaten uit Maileon, voor DM Performance, de
 * Rapportage generator en de deelpagina's. Wie dit mag opvragen, bepaalt
 * `lib/maileon/access.ts`; de routes staan in `app/api/maileon/`.
 */

import { MAILEON_API } from "./contact-filters";

const MAILEON_MIME = "application/vnd.maileon.api+xml";

/** Zo lang hergebruikt Next.js een antwoord van Maileon (in seconden). */
const MAILEON_CACHE_SECONDS = 60;

/** Maileon gaf een fout of een onbruikbaar antwoord. De melding is voor de gebruiker. */
export class MaileonError extends Error {}

/** `MAILEON_API_KEY` ontbreekt: een fout in de serverconfiguratie, niet bij Maileon. */
export class MaileonConfigError extends Error {
  constructor() {
    super("Server configuratie fout");
  }
}

function getAuthHeader(): string | null {
  const key = process.env.MAILEON_API_KEY;
  if (!key) return null;
  return `Basic ${Buffer.from(key).toString("base64")}`;
}

/** Fetch raw XML from the Maileon API */
async function maileonFetchXml(
  path: string,
  params?: Record<string, string | string[]>
): Promise<string> {
  const auth = getAuthHeader();
  if (!auth) {
    console.error("[maileon] MAILEON_API_KEY niet geconfigureerd.");
    throw new MaileonConfigError();
  }

  const url = new URL(`${MAILEON_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: auth,
      Accept: MAILEON_MIME,
      "Content-Type": MAILEON_MIME,
    },
    next: { revalidate: MAILEON_CACHE_SECONDS },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[maileon] Maileon API ${res.status}: ${text.slice(0, 500)}`);
    throw new MaileonError(`Maileon API fout (${res.status})`);
  }

  return res.text();
}

/* ---------- XML Parsing Helpers ---------- */

function getTagContent(xml: string, tag: string): string {
  const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(r);
  if (!m) return "";
  // Strip CDATA wrapper if present
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function getAllBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

export interface ParsedMailing {
  id: number;
  name: string;
  state: string;
  type: string;
  scheduleTime: string;
}

function parseMailingsXml(xml: string): ParsedMailing[] {
  const mailingBlocks = getAllBlocks(xml, "mailing");
  return mailingBlocks.map((block) => {
    const id = parseInt(getTagContent(block, "id"), 10) || 0;

    // Fields are nested: <field><name>X</name><value>Y</value></field>
    const fieldBlocks = getAllBlocks(block, "field");
    const fields: Record<string, string> = {};
    for (const fb of fieldBlocks) {
      const name = getTagContent(fb, "name");
      const value = getTagContent(fb, "value");
      if (name) fields[name] = value;
    }

    return {
      id,
      name: fields["name"] || `Mailing #${id}`,
      state: fields["state"] || "",
      type: fields["type"] || "regular",
      scheduleTime: fields["scheduleTime"] || "",
    };
  });
}

interface ParsedReport {
  mailingId: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
}

function parseReportSummariesXml(xml: string): ParsedReport[] {
  const blocks = getAllBlocks(xml, "mailing_summary");
  return blocks.map((block) => ({
    mailingId: parseInt(getTagContent(block, "mailing_id"), 10) || 0,
    recipients: parseInt(getTagContent(block, "recipients"), 10) || 0,
    opens: parseInt(getTagContent(block, "opens"), 10) || 0,
    uniqueOpens: parseInt(getTagContent(block, "opens_unique"), 10) || 0,
    clicks: parseInt(getTagContent(block, "clicks"), 10) || 0,
    uniqueClicks: parseInt(getTagContent(block, "clicks_unique"), 10) || 0,
    bounces: parseInt(getTagContent(block, "bounces"), 10) || 0,
    unsubscriptions: parseInt(getTagContent(block, "unsubscriptions"), 10) || 0,
  }));
}

/* ---------- Types ---------- */

export interface MailingSummary {
  id: number;
  name: string;
  state: string;
  type: string;
  scheduleTime: string;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
}

export interface MailingTotals {
  mailings: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  avgUnsubRate: number;
  avgCtor: number;
}

/* ---------- Ophalen ---------- */

/**
 * De verzonden mailings (`done` of `archived`) met een verzendmoment tussen
 * `from` en `to` (YYYY-MM-DD, beide inclusief).
 */
export async function listSentMailings(from: string, to: string): Promise<ParsedMailing[]> {
  // Maileon expects SQL date format: yyyy-MM-dd HH:mm:ss
  const fromDate = `${from} 00:00:00`;
  const toDate = `${to} 23:59:59`;

  // Fetch mailings scheduled after the from-date
  const mailingsXml = await maileonFetchXml("/mailings/filter/scheduletime", {
    scheduleTime: fromDate,
    beforeSchedulingTime: "false",
    fields: ["name", "state", "type", "scheduleTime"],
    page_size: "1000",
    page_index: "1",
  });

  // Filter: only done/sent mailings within the date range
  const toDateObj = new Date(toDate.replace(" ", "T") + "Z");
  return parseMailingsXml(mailingsXml).filter((m) => {
    // Only include completed mailings
    if (m.state !== "done" && m.state !== "archived") return false;
    // Filter out mailings after the to-date
    if (m.scheduleTime) {
      const schedDate = new Date(m.scheduleTime.replace(" ", "T") + "Z");
      if (schedDate > toDateObj) return false;
    }
    return true;
  });
}

function emptySummary(mailing: ParsedMailing): MailingSummary {
  return {
    ...mailing,
    recipients: 0,
    opens: 0,
    uniqueOpens: 0,
    clicks: 0,
    uniqueClicks: 0,
    bounces: 0,
    unsubscriptions: 0,
    openRate: 0,
    clickRate: 0,
    bounceRate: 0,
    unsubscribeRate: 0,
    clickToOpenRate: 0,
  };
}

/** De resultaten van deze mailings, nieuwste eerst. */
export async function fetchMailingSummaries(mailings: ParsedMailing[]): Promise<MailingSummary[]> {
  // The endpoint accepts multiple mailing_id params
  const summaries: MailingSummary[] = [];
  const batchSize = 50;

  for (let i = 0; i < mailings.length; i += batchSize) {
    const batch = mailings.slice(i, i + batchSize);
    const mailingIds = batch.map((m) => String(m.id));

    try {
      const reportXml = await maileonFetchXml("/reports/mailing_summaries", {
        mailing_id: mailingIds,
      });

      const reports = parseReportSummariesXml(reportXml);
      const reportMap = new Map(reports.map((r) => [r.mailingId, r]));

      for (const mailing of batch) {
        const report = reportMap.get(mailing.id);
        const recipients = report?.recipients ?? 0;
        const uniqueOpens = report?.uniqueOpens ?? 0;
        const uniqueClicks = report?.uniqueClicks ?? 0;
        const bounces = report?.bounces ?? 0;
        const unsubscriptions = report?.unsubscriptions ?? 0;

        summaries.push({
          id: mailing.id,
          name: mailing.name,
          state: mailing.state,
          type: mailing.type,
          scheduleTime: mailing.scheduleTime,
          recipients,
          opens: report?.opens ?? 0,
          uniqueOpens,
          clicks: report?.clicks ?? 0,
          uniqueClicks,
          bounces,
          unsubscriptions,
          openRate: recipients > 0 ? (uniqueOpens / recipients) * 100 : 0,
          clickRate: recipients > 0 ? (uniqueClicks / recipients) * 100 : 0,
          bounceRate: recipients > 0 ? (bounces / recipients) * 100 : 0,
          unsubscribeRate: recipients > 0 ? (unsubscriptions / recipients) * 100 : 0,
          clickToOpenRate: uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0,
        });
      }
    } catch {
      // If batch report fetch fails, add mailings without report data
      for (const mailing of batch) summaries.push(emptySummary(mailing));
    }
  }

  // Sort by scheduleTime descending
  summaries.sort((a, b) => {
    if (!a.scheduleTime && !b.scheduleTime) return 0;
    if (!a.scheduleTime) return 1;
    if (!b.scheduleTime) return -1;
    return b.scheduleTime.localeCompare(a.scheduleTime);
  });

  return summaries;
}

export function computeMailingTotals(summaries: MailingSummary[]): MailingTotals {
  const totals = summaries.reduce(
    (acc, s) => ({
      mailings: acc.mailings + 1,
      recipients: acc.recipients + s.recipients,
      opens: acc.opens + s.opens,
      uniqueOpens: acc.uniqueOpens + s.uniqueOpens,
      clicks: acc.clicks + s.clicks,
      uniqueClicks: acc.uniqueClicks + s.uniqueClicks,
      bounces: acc.bounces + s.bounces,
      unsubscriptions: acc.unsubscriptions + s.unsubscriptions,
    }),
    {
      mailings: 0,
      recipients: 0,
      opens: 0,
      uniqueOpens: 0,
      clicks: 0,
      uniqueClicks: 0,
      bounces: 0,
      unsubscriptions: 0,
    }
  );

  return {
    ...totals,
    avgOpenRate: totals.recipients > 0 ? (totals.uniqueOpens / totals.recipients) * 100 : 0,
    avgClickRate: totals.recipients > 0 ? (totals.uniqueClicks / totals.recipients) * 100 : 0,
    avgBounceRate: totals.recipients > 0 ? (totals.bounces / totals.recipients) * 100 : 0,
    avgUnsubRate: totals.recipients > 0 ? (totals.unsubscriptions / totals.recipients) * 100 : 0,
    avgCtor: totals.uniqueOpens > 0 ? (totals.uniqueClicks / totals.uniqueOpens) * 100 : 0,
  };
}

/** De archiefversie (webversie) van een mailing. */
export async function fetchArchiveUrl(mailingId: number): Promise<string> {
  const auth = getAuthHeader();
  if (!auth) {
    console.error("[maileon/archive] MAILEON_API_KEY niet geconfigureerd.");
    throw new MaileonConfigError();
  }

  const res = await fetch(`${MAILEON_API}/mailings/${mailingId}/archiveurl`, {
    headers: { Authorization: auth, Accept: MAILEON_MIME },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[maileon/archive] Maileon API ${res.status}: ${text.slice(0, 500)}`);
    throw new MaileonError("Ophalen van archive URL mislukt");
  }

  const text = await res.text();

  // Extract URL from XML: <archive_url>...</archive_url> or plain text
  const match = text.match(/<archive_url[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/archive_url>/i)
    ?? text.match(/<archiveurl[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/archiveurl>/i)
    ?? text.match(/(https?:\/\/\S+)/);

  const archiveUrl = match?.[1]?.trim() ?? text.trim();

  if (!archiveUrl.startsWith("http")) {
    throw new MaileonError("Geen geldige archive URL ontvangen");
  }

  return archiveUrl;
}

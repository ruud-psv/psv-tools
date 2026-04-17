import { NextRequest, NextResponse } from "next/server";

export const revalidate = 60;

const BASE_URL = "https://api.maileon.com/1.0";
const MAILEON_MIME = "application/vnd.maileon.api+xml";

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
  if (!auth) throw new Error("MAILEON_API_KEY is niet geconfigureerd");

  const url = new URL(`${BASE_URL}${path}`);
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
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Maileon API ${res.status}: ${text.slice(0, 200)}`);
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

interface ParsedMailing {
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

interface MailingSummary {
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

/* ---------- Route Handler ---------- */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Parameters 'from' en 'to' zijn vereist (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Maileon expects SQL date format: yyyy-MM-dd HH:mm:ss
    const fromDate = `${from} 00:00:00`;
    const toDate = `${to} 23:59:59`;

    // Step 1: Fetch mailings scheduled after the from-date
    const mailingsXml = await maileonFetchXml("/mailings/filter/scheduletime", {
      scheduleTime: fromDate,
      beforeSchedulingTime: "false",
      fields: ["name", "state", "type", "scheduleTime"],
      page_size: "1000",
      page_index: "1",
    });

    const allMailings = parseMailingsXml(mailingsXml);

    // Filter: only done/sent mailings within the date range
    const toDateObj = new Date(toDate.replace(" ", "T") + "Z");
    const filteredMailings = allMailings.filter((m) => {
      // Only include completed mailings
      if (m.state !== "done" && m.state !== "archived") return false;
      // Filter out mailings after the to-date
      if (m.scheduleTime) {
        const schedDate = new Date(m.scheduleTime.replace(" ", "T") + "Z");
        if (schedDate > toDateObj) return false;
      }
      return true;
    });

    if (filteredMailings.length === 0) {
      return NextResponse.json({
        mailings: [],
        totals: {
          mailings: 0,
          recipients: 0,
          opens: 0,
          uniqueOpens: 0,
          clicks: 0,
          uniqueClicks: 0,
          bounces: 0,
          unsubscriptions: 0,
          avgOpenRate: 0,
          avgClickRate: 0,
          avgBounceRate: 0,
          avgUnsubRate: 0,
          avgCtor: 0,
        },
        fetchedAt: new Date().toISOString(),
      });
    }

    // Step 2: Fetch report summaries in batches
    // The endpoint accepts multiple mailing_id params
    const summaries: MailingSummary[] = [];
    const batchSize = 50;

    for (let i = 0; i < filteredMailings.length; i += batchSize) {
      const batch = filteredMailings.slice(i, i + batchSize);
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
        for (const mailing of batch) {
          summaries.push({
            id: mailing.id,
            name: mailing.name,
            state: mailing.state,
            type: mailing.type,
            scheduleTime: mailing.scheduleTime,
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
          });
        }
      }
    }

    // Sort by scheduleTime descending
    summaries.sort((a, b) => {
      if (!a.scheduleTime && !b.scheduleTime) return 0;
      if (!a.scheduleTime) return 1;
      if (!b.scheduleTime) return -1;
      return b.scheduleTime.localeCompare(a.scheduleTime);
    });

    // Compute aggregates
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

    const avgOpenRate = totals.recipients > 0 ? (totals.uniqueOpens / totals.recipients) * 100 : 0;
    const avgClickRate = totals.recipients > 0 ? (totals.uniqueClicks / totals.recipients) * 100 : 0;
    const avgBounceRate = totals.recipients > 0 ? (totals.bounces / totals.recipients) * 100 : 0;
    const avgUnsubRate = totals.recipients > 0 ? (totals.unsubscriptions / totals.recipients) * 100 : 0;
    const avgCtor = totals.uniqueOpens > 0 ? (totals.uniqueClicks / totals.uniqueOpens) * 100 : 0;

    return NextResponse.json({
      mailings: summaries,
      totals: {
        ...totals,
        avgOpenRate,
        avgClickRate,
        avgBounceRate,
        avgUnsubRate,
        avgCtor,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Maileon data ophalen mislukt" },
      { status: 502 }
    );
  }
}

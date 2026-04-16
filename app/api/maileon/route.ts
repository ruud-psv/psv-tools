import { NextRequest, NextResponse } from "next/server";

export const revalidate = 60;

const BASE_URL = "https://api.maileon.com/1.0";

function getAuthHeader(): string | null {
  const key = process.env.MAILEON_API_KEY;
  if (!key) return null;
  return `Basic ${Buffer.from(key).toString("base64")}`;
}

async function maileonFetch(path: string, params?: Record<string, string>) {
  const auth = getAuthHeader();
  if (!auth) throw new Error("MAILEON_API_KEY is niet geconfigureerd");

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Maileon API ${res.status}: ${text}`);
  }

  return res.json();
}

interface MaileonMailing {
  id: number;
  name: string;
  state: string;
  type: string;
  subject?: string;
  scheduleTime?: string;
}

interface MaileonReportSummary {
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
}

interface MailingSummary {
  id: number;
  name: string;
  subject: string;
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

    // Fetch mailings scheduled within the date range
    // Maileon expects ISO 8601 format
    const fromDate = `${from}T00:00:00Z`;
    const toDate = `${to}T23:59:59Z`;

    // Get mailings after the from date
    const mailingsData = await maileonFetch("/mailings", {
      scheduleTime: fromDate,
      beforeSchedulingTime: "false",
      page_size: "1000",
      page_index: "1",
    });

    // mailingsData can be an array directly or wrapped in an object
    let mailings: MaileonMailing[] = [];
    if (Array.isArray(mailingsData)) {
      mailings = mailingsData;
    } else if (mailingsData?.elements) {
      mailings = mailingsData.elements;
    } else if (mailingsData?.mailings) {
      mailings = mailingsData.mailings;
    }

    // Filter to only sent/done mailings within the date range
    const toDateObj = new Date(toDate);
    const filteredMailings = mailings.filter((m: MaileonMailing) => {
      if (m.state !== "done" && m.state !== "sent" && m.state !== "paused" && m.state !== "sealed") return false;
      if (m.scheduleTime) {
        const schedDate = new Date(m.scheduleTime);
        if (schedDate > toDateObj) return false;
      }
      return true;
    });

    // Fetch report summaries for each mailing (batch in parallel, max 20 at a time)
    const summaries: MailingSummary[] = [];
    const batchSize = 20;

    for (let i = 0; i < filteredMailings.length; i += batchSize) {
      const batch = filteredMailings.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (mailing: MaileonMailing) => {
          try {
            const report = await maileonFetch(`/reports/${mailing.id}/summary`);

            const recipients = report?.recipients ?? 0;
            const opens = report?.opens ?? 0;
            const uniqueOpens = report?.unique_opens ?? report?.uniqueOpens ?? 0;
            const clicks = report?.clicks ?? 0;
            const uniqueClicks = report?.unique_clicks ?? report?.uniqueClicks ?? 0;
            const bounces = report?.bounces ?? 0;
            const unsubscriptions = report?.unsubscriptions ?? 0;

            return {
              id: mailing.id,
              name: mailing.name || `Mailing #${mailing.id}`,
              subject: mailing.subject || "",
              state: mailing.state,
              type: mailing.type || "regular",
              scheduleTime: mailing.scheduleTime || "",
              recipients,
              opens,
              uniqueOpens,
              clicks,
              uniqueClicks,
              bounces,
              unsubscriptions,
              openRate: recipients > 0 ? (uniqueOpens / recipients) * 100 : 0,
              clickRate: recipients > 0 ? (uniqueClicks / recipients) * 100 : 0,
              bounceRate: recipients > 0 ? (bounces / recipients) * 100 : 0,
              unsubscribeRate: recipients > 0 ? (unsubscriptions / recipients) * 100 : 0,
              clickToOpenRate: uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0,
            } as MailingSummary;
          } catch {
            // Skip mailings that fail to fetch reports
            return null;
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          summaries.push(result.value);
        }
      }
    }

    // Sort by scheduleTime descending
    summaries.sort((a, b) => {
      if (!a.scheduleTime && !b.scheduleTime) return 0;
      if (!a.scheduleTime) return 1;
      if (!b.scheduleTime) return -1;
      return new Date(b.scheduleTime).getTime() - new Date(a.scheduleTime).getTime();
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

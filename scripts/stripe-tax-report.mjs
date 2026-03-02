#!/usr/bin/env node

/**
 * Stripe tax report helper.
 *
 * Usage examples:
 *   STRIPE_SECRET_KEY=... node scripts/stripe-tax-report.mjs --january 2026
 *   STRIPE_SECRET_KEY=... node scripts/stripe-tax-report.mjs --month 2026-01
 *   STRIPE_SECRET_KEY=... node scripts/stripe-tax-report.mjs --start 2026-01-01 --end 2026-01-31
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function parseEnvValue(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadApiKey() {
  const envKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (envKey) return envKey;

  try {
    const raw = await readFile(resolve(".env.local"), "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (!trimmed.startsWith("STRIPE_SECRET_KEY=")) continue;
      const value = trimmed.slice("STRIPE_SECRET_KEY=".length);
      const key = parseEnvValue(value);
      if (key) return key;
    }
  } catch {
    // No .env.local fallback available.
  }

  return "";
}

function parseRange(args) {
  const january = getArgValue(args, "--january");
  if (january) {
    const year = Number(january);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error("--january must be a year between 2000 and 2100");
    }
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-01-31`,
      label: `january-${year}`,
    };
  }

  const month = getArgValue(args, "--month");
  if (month) {
    const m = String(month).match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new Error("--month must be YYYY-MM");
    const year = Number(m[1]);
    const monthNum = Number(m[2]);
    if (monthNum < 1 || monthNum > 12) throw new Error("--month must be YYYY-MM");
    const start = new Date(Date.UTC(year, monthNum - 1, 1));
    const end = new Date(Date.UTC(year, monthNum, 0));
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    return { startDate, endDate, label: `${year}-${String(monthNum).padStart(2, "0")}` };
  }

  const startDate = getArgValue(args, "--start");
  const endDate = getArgValue(args, "--end");
  if (startDate && endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error("--start and --end must be YYYY-MM-DD");
    }
    return { startDate, endDate, label: `${startDate}_to_${endDate}` };
  }

  throw new Error("Provide either --january <year>, --month <YYYY-MM>, or --start <YYYY-MM-DD> --end <YYYY-MM-DD>");
}

function toUnixStart(dateStr) {
  const ms = Date.parse(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid start date: ${dateStr}`);
  return Math.floor(ms / 1000);
}

function toUnixEnd(dateStr) {
  const ms = Date.parse(`${dateStr}T23:59:59.999Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid end date: ${dateStr}`);
  return Math.floor(ms / 1000);
}

function centsToDollars(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function normalizeCharge(charge) {
  const amount = Number(charge?.amount || 0);
  const amountRefunded = Number(charge?.amount_refunded || 0);
  const bt = charge?.balance_transaction && typeof charge.balance_transaction === "object"
    ? charge.balance_transaction
    : null;
  const fee = Number(bt?.fee || 0);

  return {
    id: String(charge?.id || ""),
    created: Number(charge?.created || 0),
    created_iso: new Date(Number(charge?.created || 0) * 1000).toISOString(),
    amount,
    amount_refunded: amountRefunded,
    fee,
    net: amount - amountRefunded - fee,
    currency: String(charge?.currency || "").toLowerCase(),
    status: String(charge?.status || ""),
    paid: Boolean(charge?.paid),
    refunded: Boolean(charge?.refunded),
    customer: charge?.customer ? String(charge.customer) : "",
    receipt_email: charge?.receipt_email ? String(charge.receipt_email) : "",
    description: charge?.description ? String(charge.description) : "",
  };
}

async function stripeList(endpoint, apiKey, params) {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) qp.append(k, String(item));
    } else {
      qp.set(k, String(v));
    }
  }

  const res = await fetch(`https://api.stripe.com/v1/${endpoint}?${qp.toString()}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
    throw new Error(`Stripe ${endpoint} failed (${res.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
  }

  return await res.json();
}

async function fetchAllCharges(apiKey, startUnix, endUnix, maxRows = 10000) {
  const all = [];
  let startingAfter = "";
  let hasMore = true;

  while (hasMore && all.length < maxRows) {
    const perPage = Math.max(1, Math.min(100, maxRows - all.length));
    const payload = await stripeList("charges", apiKey, {
      "created[gte]": startUnix,
      "created[lte]": endUnix,
      limit: perPage,
      "expand[]": ["data.balance_transaction"],
      starting_after: startingAfter || undefined,
    });

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...rows);

    hasMore = Boolean(payload?.has_more) && rows.length > 0;
    startingAfter = rows.length > 0 ? String(rows[rows.length - 1]?.id || "") : "";
    if (!startingAfter) hasMore = false;
  }

  return all;
}

async function fetchAllPayouts(apiKey, startUnix, endUnix, maxRows = 10000) {
  const all = [];
  let startingAfter = "";
  let hasMore = true;

  while (hasMore && all.length < maxRows) {
    const perPage = Math.max(1, Math.min(100, maxRows - all.length));
    const payload = await stripeList("payouts", apiKey, {
      "arrival_date[gte]": startUnix,
      "arrival_date[lte]": endUnix,
      limit: perPage,
      starting_after: startingAfter || undefined,
    });

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...rows);

    hasMore = Boolean(payload?.has_more) && rows.length > 0;
    startingAfter = rows.length > 0 ? String(rows[rows.length - 1]?.id || "") : "";
    if (!startingAfter) hasMore = false;
  }

  return all;
}

function buildCsv(rows) {
  const escapeCsv = (value) => {
    const s = String(value == null ? "" : value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "id",
    "created",
    "amount",
    "amount_refunded",
    "fee",
    "net",
    "currency",
    "status",
    "paid",
    "refunded",
    "customer",
    "receipt_email",
    "description",
  ];

  const lines = [header.join(",")];
  for (const c of rows) {
    lines.push([
      c.id,
      c.created_iso,
      c.amount,
      c.amount_refunded,
      c.fee,
      c.net,
      c.currency,
      c.status,
      c.paid,
      c.refunded,
      c.customer,
      c.receipt_email,
      c.description,
    ].map(escapeCsv).join(","));
  }

  return lines.join("\n");
}

function summarizeCharges(rows) {
  let gross = 0;
  let refunds = 0;
  let fees = 0;
  let count = 0;
  const currencyBreakdown = {};

  for (const c of rows) {
    if (!c.paid || c.status !== "succeeded") continue;

    count += 1;
    gross += c.amount;
    refunds += c.amount_refunded;
    fees += c.fee;

    const currency = c.currency || "unknown";
    if (!currencyBreakdown[currency]) {
      currencyBreakdown[currency] = {
        count_charges: 0,
        gross_cents: 0,
        refunds_cents: 0,
        fees_cents: 0,
        net_cents: 0,
      };
    }

    currencyBreakdown[currency].count_charges += 1;
    currencyBreakdown[currency].gross_cents += c.amount;
    currencyBreakdown[currency].refunds_cents += c.amount_refunded;
    currencyBreakdown[currency].fees_cents += c.fee;
    currencyBreakdown[currency].net_cents += c.net;
  }

  const net = gross - refunds - fees;
  return {
    count_charges: count,
    gross_cents: gross,
    refunds_cents: refunds,
    fees_cents: fees,
    net_cents: net,
    gross_dollars: centsToDollars(gross),
    refunds_dollars: centsToDollars(refunds),
    fees_dollars: centsToDollars(fees),
    net_dollars: centsToDollars(net),
    currency_breakdown: currencyBreakdown,
  };
}

function summarizePayouts(payouts) {
  let total = 0;
  let count = 0;

  for (const p of payouts) {
    if (p?.status !== "paid") continue;
    total += Number(p?.amount || 0);
    count += 1;
  }

  return {
    count_payouts: count,
    payouts_cents: total,
    payouts_dollars: centsToDollars(total),
  };
}

async function main() {
  const apiKey = await loadApiKey();
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set (checked shell env and .env.local)");
  }

  const args = process.argv.slice(2);
  const { startDate, endDate, label } = parseRange(args);
  const maxRows = Math.max(1, Math.min(100000, Number(getArgValue(args, "--max") || 10000)));

  const startUnix = toUnixStart(startDate);
  const endUnix = toUnixEnd(endDate);

  if (endUnix < startUnix) {
    throw new Error("end date must be on or after start date");
  }

  const charges = await fetchAllCharges(apiKey, startUnix, endUnix, maxRows);
  const normalized = charges.map(normalizeCharge);
  const summary = summarizeCharges(normalized);

  let payoutSummary = { count_payouts: 0, payouts_cents: 0, payouts_dollars: "0.00", note: "Unavailable" };
  try {
    const payouts = await fetchAllPayouts(apiKey, startUnix, endUnix, maxRows);
    payoutSummary = { ...summarizePayouts(payouts), note: "Paid payouts by arrival_date in range" };
  } catch (err) {
    payoutSummary = {
      count_payouts: 0,
      payouts_cents: 0,
      payouts_dollars: "0.00",
      note: `Payout fetch failed: ${err?.message || String(err)}`,
    };
  }

  const csv = buildCsv(normalized);
  const outDir = resolve("/root/clawd/projects/chimera-gateway/modules/stripe-tax-read/exports");
  await mkdir(outDir, { recursive: true });
  const csvPath = resolve(outDir, `charges-${label}.csv`);
  await writeFile(csvPath, csv, "utf8");

  const report = {
    period: {
      start_date: startDate,
      end_date: endDate,
      start_utc: new Date(startUnix * 1000).toISOString(),
      end_utc: new Date(endUnix * 1000).toISOString(),
    },
    charges_fetched: normalized.length,
    summary,
    payouts: payoutSummary,
    csv_path: csvPath,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});

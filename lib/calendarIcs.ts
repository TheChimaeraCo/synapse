import type { CalendarEvent } from "@/lib/calendarStore";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function escapeText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  const limit = 75;
  if (line.length <= limit) return line;
  const out: string[] = [];
  let rest = line;
  while (rest.length > limit) {
    out.push(rest.slice(0, limit));
    rest = ` ${rest.slice(limit)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildCalendarIcs(
  calendarName: string,
  events: CalendarEvent[],
): string {
  const now = Date.now();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName || "Synapse Calendar")}`,
    "X-WR-TIMEZONE:UTC",
    "PRODID:-//Synapse//Calendar Feed//EN",
  ];

  for (const event of events) {
    const startAt = event.startAt;
    const endAt = event.endAt > startAt ? event.endAt : startAt + 60 * 60 * 1000;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(event.id)}@synapse`);
    lines.push(`DTSTAMP:${formatUtcDateTime(now)}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(startAt)}`);
      const endExclusive = endAt + 24 * 60 * 60 * 1000;
      lines.push(`DTEND;VALUE=DATE:${formatDate(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${formatUtcDateTime(startAt)}`);
      lines.push(`DTEND:${formatUtcDateTime(endAt)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map((line) => foldLine(line)).join("\r\n") + "\r\n";
}

export interface SkillFunction {
  name: string;
  description: string;
  parameters: string; // JSON schema string
  handler: (args: Record<string, any>, context: SkillContext) => Promise<string>;
}

export interface SkillContext {
  gatewayId: string;
  agentId?: string;
  sessionId?: string;
}

export interface BuiltinSkill {
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  functions: SkillFunction[];
  triggers?: { type: string; value: string }[];
}

const webSearchSkill: BuiltinSkill = {
  name: "web-search",
  description: "Search the web for current information with formatted results including titles, URLs, and descriptions.",
  version: "1.0.0",
  author: "Synapse",
  category: "utility",
  triggers: [
    { type: "keyword", value: "search" },
    { type: "keyword", value: "look up" },
    { type: "keyword", value: "find online" },
  ],
  functions: [
    {
      name: "search",
      description: "Search the web and return formatted results",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          count: { type: "number", description: "Number of results (1-10)", default: 5 },
        },
        required: ["query"],
      }),
      handler: async (args) => {
        const apiKey = process.env.BRAVE_SEARCH_API_KEY;
        if (!apiKey) return "Web search not configured (missing BRAVE_SEARCH_API_KEY).";
        try {
          const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query)}&count=${args.count ?? 5}`;
          const res = await fetch(url, {
            headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
          });
          if (!res.ok) return `Search failed: ${res.status}`;
          const data = await res.json();
          const results = (data.web?.results || []).slice(0, args.count ?? 5);
          if (!results.length) return "No results found.";
          return results
            .map((r: any, i: number) => `### ${i + 1}. ${r.title}\n${r.url}\n${r.description || "No description"}`)
            .join("\n\n");
        } catch (e: any) {
          return `Search error: ${e.message}`;
        }
      },
    },
  ],
};

const timeDateSkill: BuiltinSkill = {
  name: "time-date",
  description: "Get current time, convert between timezones, and perform date math.",
  version: "1.0.0",
  author: "Synapse",
  category: "utility",
  triggers: [
    { type: "keyword", value: "time" },
    { type: "keyword", value: "date" },
    { type: "keyword", value: "timezone" },
  ],
  functions: [
    {
      name: "now",
      description: "Get the current date and time in a given timezone",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          timezone: { type: "string", description: "IANA timezone (default UTC)", default: "UTC" },
        },
      }),
      handler: async (args) => {
        const tz = args.timezone || "UTC";
        try {
          const formatted = new Date().toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "long" });
          return `Current time (${tz}): ${formatted}`;
        } catch {
          return `Current time (UTC): ${new Date().toISOString()}`;
        }
      },
    },
    {
      name: "convert",
      description: "Convert a time between two timezones",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          time: { type: "string", description: "Time string (e.g. '2024-01-15 14:00')" },
          from: { type: "string", description: "Source timezone" },
          to: { type: "string", description: "Target timezone" },
        },
        required: ["time", "from", "to"],
      }),
      handler: async (args) => {
        try {
          const date = new Date(args.time + (args.time.includes("T") ? "" : "T00:00:00"));
          const fromStr = date.toLocaleString("en-US", { timeZone: args.from, dateStyle: "full", timeStyle: "long" });
          const toStr = date.toLocaleString("en-US", { timeZone: args.to, dateStyle: "full", timeStyle: "long" });
          return `${args.from}: ${fromStr}\n${args.to}: ${toStr}`;
        } catch (e: any) {
          return `Conversion error: ${e.message}`;
        }
      },
    },
    {
      name: "add",
      description: "Add days/hours/minutes to a date",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          date: { type: "string", description: "Start date (ISO format or natural)" },
          days: { type: "number", default: 0 },
          hours: { type: "number", default: 0 },
          minutes: { type: "number", default: 0 },
        },
        required: ["date"],
      }),
      handler: async (args) => {
        try {
          const d = new Date(args.date);
          if (args.days) d.setDate(d.getDate() + args.days);
          if (args.hours) d.setHours(d.getHours() + args.hours);
          if (args.minutes) d.setMinutes(d.getMinutes() + args.minutes);
          return `Result: ${d.toLocaleString("en-US", { dateStyle: "full", timeStyle: "long" })}`;
        } catch (e: any) {
          return `Date math error: ${e.message}`;
        }
      },
    },
  ],
};

const noteTakerSkill: BuiltinSkill = {
  name: "note-taker",
  description: "Save and retrieve notes in the knowledge base. Persistent storage for important information.",
  version: "1.0.0",
  author: "Synapse",
  category: "knowledge",
  triggers: [
    { type: "keyword", value: "note" },
    { type: "keyword", value: "remember" },
    { type: "keyword", value: "save" },
  ],
  functions: [
    {
      name: "save",
      description: "Save a note to the knowledge base",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          key: { type: "string", description: "Note title/key" },
          content: { type: "string", description: "Note content" },
          category: { type: "string", description: "Category for organization", default: "note" },
        },
        required: ["key", "content"],
      }),
      handler: async (args, context) => {
        // This will be wired to Convex knowledge table via API
        return `Note saved: "${args.key}" - ${args.content.substring(0, 50)}...`;
      },
    },
    {
      name: "search",
      description: "Search notes in the knowledge base",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          category: { type: "string", description: "Filter by category" },
        },
        required: ["query"],
      }),
      handler: async (args, context) => {
        // This will be wired to Convex knowledge table via API
        return `Searching notes for: "${args.query}"`;
      },
    },
    {
      name: "list",
      description: "List all saved notes",
      parameters: JSON.stringify({
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category" },
        },
      }),
      handler: async (args, context) => {
        return "Listing all notes...";
      },
    },
  ],
};

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  webSearchSkill,
  timeDateSkill,
  noteTakerSkill,
];

export const SKILL_REGISTRY = new Map<string, BuiltinSkill>(
  BUILTIN_SKILLS.map((s) => [s.name, s])
);

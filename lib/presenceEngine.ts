export interface PresenceState {
  lastActivity: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
  pendingQueue: { message: string; priority: number; scheduledFor: number }[];
}

export interface Topic {
  _id: string;
  name: string;
  category: string;
  personalWeight: number;
  frequencyWeight: number;
  lastMentioned: number;
  mentionCount: number;
}

export function shouldInitiate(state: PresenceState, topics: Topic[]): boolean {
  if (isInQuietHours(state)) return false;
  const idleMs = Date.now() - state.lastActivity;
  const hasActiveTopics = topics.some(
    (t) => (t.personalWeight + t.frequencyWeight) / 2 > 0.5
  );
  // Initiate if idle >4h and has active topics
  return idleMs > 4 * 60 * 60 * 1000 && hasActiveTopics;
}

export function selectTopic(topics: Topic[]): Topic | null {
  if (topics.length === 0) return null;
  // Weighted random selection
  const scored = topics.map((t) => ({
    topic: t,
    score: (t.personalWeight + t.frequencyWeight) / 2,
  }));
  const total = scored.reduce((s, t) => s + t.score, 0);
  if (total === 0) return scored[0].topic;
  let r = Math.random() * total;
  for (const s of scored) {
    r -= s.score;
    if (r <= 0) return s.topic;
  }
  return scored[scored.length - 1].topic;
}

export function formatInitiation(topic: Topic): string {
  const templates = [
    `I've been thinking about ${topic.name} - want to discuss?`,
    `${topic.name} came to mind. Any updates on that?`,
    `Quick thought on ${topic.name} - worth revisiting?`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function isInQuietHours(state: PresenceState): boolean {
  if (!state.quietHoursStart || !state.quietHoursEnd) return false;
  const now = new Date();
  const tz = state.timezone || "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  const currentTime = formatter.format(now);
  const { quietHoursStart: start, quietHoursEnd: end } = state;
  if (start <= end) return currentTime >= start && currentTime <= end;
  return currentTime >= start || currentTime <= end;
}

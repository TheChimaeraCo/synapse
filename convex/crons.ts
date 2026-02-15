import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup-stale-sessions",
  { hours: 1 },
  internal.functions.sessions.cleanupStale
);

crons.interval(
  "heartbeat",
  { minutes: 5 },
  internal.actions.heartbeat.run
);

crons.interval(
  "check-scheduled-tasks",
  { minutes: 1 },
  internal.functions.scheduler.checkDue
);

crons.interval(
  "generate-embeddings",
  { hours: 1 },
  internal.actions.embeddings.processQueue
);

export default crons;

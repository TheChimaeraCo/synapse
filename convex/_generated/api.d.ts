/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_ai from "../actions/ai.js";
import type * as actions_embeddings from "../actions/embeddings.js";
import type * as actions_heartbeat from "../actions/heartbeat.js";
import type * as actions_router from "../actions/router.js";
import type * as actions_telegram from "../actions/telegram.js";
import type * as actions_watchdog from "../actions/watchdog.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as functions_activeRuns from "../functions/activeRuns.js";
import type * as functions_agentMessages from "../functions/agentMessages.js";
import type * as functions_agents from "../functions/agents.js";
import type * as functions_approvals from "../functions/approvals.js";
import type * as functions_auditLog from "../functions/auditLog.js";
import type * as functions_channels from "../functions/channels.js";
import type * as functions_circuitBreakers from "../functions/circuitBreakers.js";
import type * as functions_config from "../functions/config.js";
import type * as functions_conversations from "../functions/conversations.js";
import type * as functions_dashboard from "../functions/dashboard.js";
import type * as functions_files from "../functions/files.js";
import type * as functions_gatewayConfig from "../functions/gatewayConfig.js";
import type * as functions_gatewayInvites from "../functions/gatewayInvites.js";
import type * as functions_gatewayMembers from "../functions/gatewayMembers.js";
import type * as functions_gateways from "../functions/gateways.js";
import type * as functions_health from "../functions/health.js";
import type * as functions_heartbeat from "../functions/heartbeat.js";
import type * as functions_knowledge from "../functions/knowledge.js";
import type * as functions_messages from "../functions/messages.js";
import type * as functions_migration from "../functions/migration.js";
import type * as functions_notifications from "../functions/notifications.js";
import type * as functions_onboarding from "../functions/onboarding.js";
import type * as functions_presence from "../functions/presence.js";
import type * as functions_projects from "../functions/projects.js";
import type * as functions_pushSubscriptions from "../functions/pushSubscriptions.js";
import type * as functions_responseCache from "../functions/responseCache.js";
import type * as functions_roles from "../functions/roles.js";
import type * as functions_scheduler from "../functions/scheduler.js";
import type * as functions_sessions from "../functions/sessions.js";
import type * as functions_skills from "../functions/skills.js";
import type * as functions_tasks from "../functions/tasks.js";
import type * as functions_telegramAuth from "../functions/telegramAuth.js";
import type * as functions_tools from "../functions/tools.js";
import type * as functions_topics from "../functions/topics.js";
import type * as functions_usage from "../functions/usage.js";
import type * as functions_users from "../functions/users.js";
import type * as functions_watchdogHelpers from "../functions/watchdogHelpers.js";
import type * as functions_workerAgents from "../functions/workerAgents.js";
import type * as http from "../http.js";
import type * as lib_costCalculator from "../lib/costCalculator.js";
import type * as lib_gatewayAuth from "../lib/gatewayAuth.js";
import type * as lib_validators from "../lib/validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/ai": typeof actions_ai;
  "actions/embeddings": typeof actions_embeddings;
  "actions/heartbeat": typeof actions_heartbeat;
  "actions/router": typeof actions_router;
  "actions/telegram": typeof actions_telegram;
  "actions/watchdog": typeof actions_watchdog;
  auth: typeof auth;
  crons: typeof crons;
  "functions/activeRuns": typeof functions_activeRuns;
  "functions/agentMessages": typeof functions_agentMessages;
  "functions/agents": typeof functions_agents;
  "functions/approvals": typeof functions_approvals;
  "functions/auditLog": typeof functions_auditLog;
  "functions/channels": typeof functions_channels;
  "functions/circuitBreakers": typeof functions_circuitBreakers;
  "functions/config": typeof functions_config;
  "functions/conversations": typeof functions_conversations;
  "functions/dashboard": typeof functions_dashboard;
  "functions/files": typeof functions_files;
  "functions/gatewayConfig": typeof functions_gatewayConfig;
  "functions/gatewayInvites": typeof functions_gatewayInvites;
  "functions/gatewayMembers": typeof functions_gatewayMembers;
  "functions/gateways": typeof functions_gateways;
  "functions/health": typeof functions_health;
  "functions/heartbeat": typeof functions_heartbeat;
  "functions/knowledge": typeof functions_knowledge;
  "functions/messages": typeof functions_messages;
  "functions/migration": typeof functions_migration;
  "functions/notifications": typeof functions_notifications;
  "functions/onboarding": typeof functions_onboarding;
  "functions/presence": typeof functions_presence;
  "functions/projects": typeof functions_projects;
  "functions/pushSubscriptions": typeof functions_pushSubscriptions;
  "functions/responseCache": typeof functions_responseCache;
  "functions/roles": typeof functions_roles;
  "functions/scheduler": typeof functions_scheduler;
  "functions/sessions": typeof functions_sessions;
  "functions/skills": typeof functions_skills;
  "functions/tasks": typeof functions_tasks;
  "functions/telegramAuth": typeof functions_telegramAuth;
  "functions/tools": typeof functions_tools;
  "functions/topics": typeof functions_topics;
  "functions/usage": typeof functions_usage;
  "functions/users": typeof functions_users;
  "functions/watchdogHelpers": typeof functions_watchdogHelpers;
  "functions/workerAgents": typeof functions_workerAgents;
  http: typeof http;
  "lib/costCalculator": typeof lib_costCalculator;
  "lib/gatewayAuth": typeof lib_gatewayAuth;
  "lib/validators": typeof lib_validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

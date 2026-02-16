import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // --- AUTH (Auth.js adapter tables) ---
  authUsers: defineTable({
    name: v.optional(v.string()),
    email: v.string(),
    emailVerified: v.optional(v.number()),
    image: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("user"), v.literal("viewer")),
    gatewayId: v.string(),
    isGlobalAdmin: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_gatewayId", ["gatewayId"]),

  authSessions: defineTable({
    userId: v.id("authUsers"),
    sessionToken: v.string(),
    expires: v.number(),
    gatewayId: v.string(),
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_userId", ["userId"]),

  authAccounts: defineTable({
    userId: v.id("authUsers"),
    type: v.string(),
    provider: v.string(),
    providerAccountId: v.string(),
    refresh_token: v.optional(v.string()),
    access_token: v.optional(v.string()),
    expires_at: v.optional(v.number()),
    token_type: v.optional(v.string()),
    scope: v.optional(v.string()),
    id_token: v.optional(v.string()),
    session_state: v.optional(v.string()),
    gatewayId: v.string(),
  })
    .index("by_provider_providerAccountId", ["provider", "providerAccountId"])
    .index("by_userId", ["userId"]),

  // --- GATEWAYS ---
  gateways: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("authUsers"),
    status: v.union(v.literal("active"), v.literal("paused")),
    isMaster: v.optional(v.boolean()),
    workspacePath: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerId", ["ownerId"]),

  // --- GATEWAY CONFIG (per-gateway key-value, replaces systemConfig per gateway) ---
  gatewayConfig: defineTable({
    gatewayId: v.id("gateways"),
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_gateway_key", ["gatewayId", "key"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- GATEWAY MEMBERS ---
  gatewayMembers: defineTable({
    gatewayId: v.id("gateways"),
    userId: v.id("authUsers"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
    addedBy: v.optional(v.id("authUsers")),
    addedAt: v.number(),
    lastActiveAt: v.optional(v.number()),
  }).index("by_gatewayId", ["gatewayId"])
    .index("by_userId", ["userId"])
    .index("by_gateway_user", ["gatewayId", "userId"]),

  // --- GATEWAY INVITES ---
  gatewayInvites: defineTable({
    gatewayId: v.id("gateways"),
    code: v.string(),
    createdBy: v.id("authUsers"),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    maxUses: v.optional(v.number()),
    uses: v.number(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_code", ["code"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- AGENTS ---
  agents: defineTable({
    gatewayId: v.id("gateways"),
    name: v.string(),
    slug: v.string(),
    model: v.string(),
    systemPrompt: v.string(),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_slug_gatewayId", ["slug", "gatewayId"]),

  // --- CHANNELS ---
  channels: defineTable({
    gatewayId: v.id("gateways"),
    platform: v.union(v.literal("telegram"), v.literal("hub"), v.literal("discord"), v.literal("whatsapp"), v.literal("api"), v.literal("custom")),
    name: v.string(),
    agentId: v.id("agents"),
    isActive: v.boolean(),
    enabled: v.optional(v.boolean()),
    config: v.any(),
    responseFormat: v.optional(v.string()),
    maxMessageLength: v.optional(v.number()),
    streamingEnabled: v.optional(v.boolean()),
    typingIndicator: v.optional(v.boolean()),
    lastActivityAt: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    category: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_platform", ["platform"])
    .index("by_agentId", ["agentId"]),

  // --- CHANNEL USERS ---
  channelUsers: defineTable({
    channelId: v.id("channels"),
    externalUserId: v.string(),
    synapseUserId: v.optional(v.id("authUsers")),
    displayName: v.string(),
    isBot: v.boolean(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    messageCount: v.number(),
  }).index("by_channel_external", ["channelId", "externalUserId"]),

  // --- SESSIONS ---
  sessions: defineTable({
    gatewayId: v.id("gateways"),
    agentId: v.id("agents"),
    channelId: v.id("channels"),
    userId: v.optional(v.id("authUsers")),
    externalUserId: v.string(),
    title: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("archived")
    ),
    meta: v.optional(v.any()),
    lastMessageAt: v.number(),
    messageCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_channel_externalUser", ["channelId", "externalUserId"])
    .index("by_agentId", ["agentId"])
    .index("by_userId", ["userId"])
    .index("by_status_lastMessage", ["status", "lastMessageAt"]),

  // --- MESSAGES ---
  messages: defineTable({
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    agentId: v.id("agents"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    seq: v.optional(v.number()),
    tokens: v.optional(v.object({
      input: v.number(),
      output: v.number(),
    })),
    cost: v.optional(v.number()),
    model: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    channelMessageId: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    projectId: v.optional(v.id("projects")),
    metadata: v.optional(v.any()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_gatewayId", ["gatewayId"])
    .index("by_conversationId", ["conversationId"])
    .index("by_session_seq", ["sessionId", "seq"])
    .index("by_projectId", ["projectId"]),

  // --- ACTIVE RUNS (for streaming state) ---
  activeRuns: defineTable({
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    status: v.union(
      v.literal("thinking"),
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("error")
    ),
    streamedContent: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"]),

  // --- USAGE RECORDS ---
  usageRecords: defineTable({
    gatewayId: v.id("gateways"),
    agentId: v.id("agents"),
    sessionId: v.optional(v.id("sessions")),
    messageId: v.optional(v.id("messages")),
    userId: v.optional(v.id("authUsers")),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cost: v.number(),
    date: v.string(),
  })
    .index("by_gatewayId_date", ["gatewayId", "date"])
    .index("by_agentId_date", ["agentId", "date"])
    .index("by_date", ["date"]),

  // --- USAGE BUDGETS ---
  usageBudgets: defineTable({
    gatewayId: v.id("gateways"),
    period: v.union(v.literal("daily"), v.literal("monthly")),
    limitUsd: v.number(),
    action: v.union(v.literal("warn"), v.literal("block")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"]),

  // --- KNOWLEDGE ---
  knowledge: defineTable({
    gatewayId: v.id("gateways"),
    agentId: v.id("agents"),
    userId: v.optional(v.string()),
    category: v.string(),
    key: v.string(),
    value: v.string(),
    confidence: v.number(),
    source: v.string(),
    sourceMessageId: v.optional(v.id("messages")),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_user", ["agentId", "userId"])
    .index("by_agent_category", ["agentId", "category"])
    .index("by_key", ["agentId", "userId", "key"]),

  // --- TOOLS ---
  tools: defineTable({
    gatewayId: v.id("gateways"),
    name: v.string(),
    description: v.string(),
    category: v.string(),
    enabled: v.boolean(),
    requiresApproval: v.boolean(),
    parameters: v.any(),
    handlerCode: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_name", ["gatewayId", "name"]),

  // --- APPROVALS ---
  approvals: defineTable({
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    toolName: v.string(),
    toolArgs: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied")
    ),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId", "status"]),

  // --- RESPONSE CACHE ---
  responseCache: defineTable({
    hash: v.string(),
    response: v.string(),
    model: v.string(),
    tokens: v.object({ input: v.number(), output: v.number() }),
    cost: v.number(),
    ttlMs: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_hash", ["hash"]),

  // --- AUDIT LOGS ---
  auditLogs: defineTable({
    userId: v.optional(v.id("authUsers")),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    ip: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_action", ["action"])
    .index("by_timestamp", ["timestamp"]),

  // --- SKILLS ---
  skills: defineTable({
    name: v.string(),
    description: v.string(),
    version: v.string(),
    author: v.string(),
    category: v.string(),
    status: v.string(),
    config: v.optional(v.any()),
    functions: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        parameters: v.string(),
      })
    ),
    triggers: v.optional(
      v.array(
        v.object({
          type: v.string(),
          value: v.string(),
        })
      )
    ),
    installedAt: v.optional(v.number()),
    gatewayId: v.string(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"]),

  // --- TOPICS (Presence Engine) ---
  topics: defineTable({
    name: v.string(),
    category: v.string(),
    personalWeight: v.number(),
    frequencyWeight: v.number(),
    lastMentioned: v.number(),
    mentionCount: v.number(),
    gatewayId: v.string(),
    metadata: v.optional(v.any()),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_name_gatewayId", ["name", "gatewayId"]),

  // --- PRESENCE STATE ---
  presenceState: defineTable({
    gatewayId: v.string(),
    lastActivity: v.number(),
    activeTopics: v.array(v.id("topics")),
    quietHoursStart: v.optional(v.string()),
    quietHoursEnd: v.optional(v.string()),
    timezone: v.optional(v.string()),
    pendingQueue: v.array(v.object({
      message: v.string(),
      priority: v.number(),
      scheduledFor: v.number(),
    })),
  })
    .index("by_gatewayId", ["gatewayId"]),

  // --- PROJECTS ---
  projects: defineTable({
    name: v.string(),
    description: v.string(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("completed"), v.literal("archived")),
    priority: v.number(),
    gatewayId: v.string(),
    lastActiveAt: v.optional(v.number()),
    conversationCount: v.optional(v.number()),
    activeTaskCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gatewayId_status", ["gatewayId", "status"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- TASKS ---
  tasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("blocked"), v.literal("done")),
    priority: v.number(),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    gatewayId: v.string(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_gatewayId_status", ["gatewayId", "status"]),

  // --- FILES ---
  files: defineTable({
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    sessionId: v.optional(v.id("sessions")),
    messageId: v.optional(v.id("messages")),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.optional(v.string()),
    url: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_session", ["sessionId"])
    .index("by_message", ["messageId"]),

  // --- AGENT MESSAGES (A2A Communication) ---
  agentMessages: defineTable({
    fromGatewayId: v.id("gateways"),
    toGatewayId: v.id("gateways"),
    fromAgentId: v.id("agents"),
    toAgentId: v.optional(v.id("agents")),
    content: v.string(),
    type: v.union(v.literal("request"), v.literal("response"), v.literal("broadcast")),
    status: v.union(v.literal("pending"), v.literal("read"), v.literal("replied")),
    replyTo: v.optional(v.id("agentMessages")),
    createdAt: v.number(),
  })
    .index("by_to", ["toGatewayId", "status"])
    .index("by_from", ["fromGatewayId"]),

  // --- MESSAGE PINS ---
  messagePins: defineTable({
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    messageId: v.id("messages"),
    userId: v.id("authUsers"),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_message", ["messageId"]),

  // --- SYSTEM CONFIG ---
  systemConfig: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // --- HEALTH CHECKS ---
  healthChecks: defineTable({
    component: v.string(),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("down")),
    lastCheck: v.number(),
    lastHealthy: v.number(),
    message: v.string(),
    metadata: v.optional(v.any()),
    gatewayId: v.optional(v.id("gateways")),
  })
    .index("by_component", ["component"])
    .index("by_status", ["status"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- CIRCUIT BREAKERS ---
  circuitBreakers: defineTable({
    name: v.string(),
    state: v.union(v.literal("closed"), v.literal("open"), v.literal("half-open")),
    failures: v.number(),
    lastFailure: v.optional(v.number()),
    lastSuccess: v.optional(v.number()),
    threshold: v.number(),
    resetAfterMs: v.number(),
    gatewayId: v.optional(v.id("gateways")),
  })
    .index("by_name", ["name"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- NOTIFICATIONS ---
  notifications: defineTable({
    userId: v.optional(v.string()),
    type: v.union(v.literal("info"), v.literal("warning"), v.literal("error"), v.literal("critical")),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
    gatewayId: v.optional(v.id("gateways")),
  })
    .index("by_userId_read", ["userId", "read"])
    .index("by_createdAt", ["createdAt"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- WORKER AGENTS ---
  workerAgents: defineTable({
    parentSessionId: v.id("sessions"),
    gatewayId: v.id("gateways"),
    projectId: v.optional(v.id("projects")),
    label: v.string(),
    task: v.optional(v.string()),
    status: v.string(),
    model: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    tokens: v.optional(v.object({ input: v.number(), output: v.number() })),
    cost: v.optional(v.number()),
    context: v.optional(v.string()),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    logs: v.optional(v.array(v.string())),
  })
    .index("by_session", ["parentSessionId"])
    .index("by_gateway_status", ["gatewayId", "status"])
    .index("by_projectId", ["projectId"]),

  // --- HEARTBEAT MODULES ---
  heartbeatModules: defineTable({
    gatewayId: v.id("gateways"),
    name: v.string(),
    description: v.string(),
    enabled: v.boolean(),
    intervalMinutes: v.number(),
    handler: v.string(),
    config: v.optional(v.any()),
    lastRunAt: v.optional(v.number()),
    lastResult: v.optional(v.string()),
    lastStatus: v.optional(v.union(v.literal("ok"), v.literal("alert"), v.literal("error"))),
    order: v.number(),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_enabled", ["gatewayId", "enabled"]),

  // --- HEARTBEAT RUNS ---
  heartbeatRuns: defineTable({
    gatewayId: v.id("gateways"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    modulesRun: v.number(),
    alerts: v.number(),
    results: v.any(),
    triggeredActions: v.optional(v.array(v.string())),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_time", ["gatewayId", "startedAt"]),

  // --- USER CRON JOBS ---
  userCronJobs: defineTable({
    gatewayId: v.id("gateways"),
    label: v.string(),
    schedule: v.string(),
    prompt: v.string(),
    enabled: v.boolean(),
    lastRunAt: v.optional(v.number()),
    lastResult: v.optional(v.string()),
    lastStatus: v.optional(v.union(v.literal("ok"), v.literal("error"))),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_enabled", ["gatewayId", "enabled"]),

  // --- AGENT SOULS ---
  agentSouls: defineTable({
    agentId: v.id("agents"),
    gatewayId: v.id("gateways"),
    name: v.string(),
    emoji: v.optional(v.string()),
    personality: v.string(),
    purpose: v.string(),
    tone: v.string(),
    interests: v.optional(v.array(v.string())),
    boundaries: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    birthConversation: v.optional(v.array(v.object({
      role: v.string(),
      content: v.string(),
      timestamp: v.number(),
    }))),
  })
    .index("by_agent", ["agentId"])
    .index("by_gateway", ["gatewayId"]),

  // --- USER PROFILES ---
  userProfiles: defineTable({
    userId: v.optional(v.id("authUsers")),
    gatewayId: v.id("gateways"),
    displayName: v.string(),
    timezone: v.optional(v.string()),
    occupation: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    communicationStyle: v.optional(v.string()),
    context: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_gateway", ["gatewayId"]),

  // --- ONBOARDING STATE ---
  onboardingState: defineTable({
    gatewayId: v.id("gateways"),
    userId: v.id("authUsers"),
    status: v.union(v.literal("in_progress"), v.literal("complete")),
    messages: v.array(v.object({
      role: v.string(),
      content: v.string(),
      timestamp: v.number(),
    })),
    soulData: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_user_gateway", ["userId", "gatewayId"]),

  // --- CONVERSATIONS (Conversation Chains) ---
  conversations: defineTable({
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    userId: v.optional(v.id("authUsers")),
    projectId: v.optional(v.id("projects")),
    title: v.optional(v.string()),
    status: v.string(), // "active" | "closed"
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    topics: v.optional(v.array(v.string())),
    decisions: v.optional(v.array(v.object({
      what: v.string(),
      reasoning: v.optional(v.string()),
      supersedes: v.optional(v.string()),
    }))),
    startSeq: v.optional(v.number()),
    endSeq: v.optional(v.number()),
    relations: v.optional(v.array(v.object({
      conversationId: v.id("conversations"),
      type: v.string(),
    }))),
    previousConvoId: v.optional(v.id("conversations")),
    relatedConvoIds: v.optional(v.array(v.id("conversations"))),
    depth: v.number(),
    knowledgeExtracted: v.boolean(),
    messageCount: v.number(),
    firstMessageAt: v.number(),
    lastMessageAt: v.number(),
    closedAt: v.optional(v.number()),
    escalationLevel: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_status", ["status"])
    .index("by_gatewayId", ["gatewayId"])
    .index("by_previousConvoId", ["previousConvoId"])
    .index("by_projectId", ["projectId"]),

  // --- SCHEDULED TASKS ---
  scheduledTasks: defineTable({
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    sessionId: v.optional(v.id("sessions")),
    label: v.string(),
    type: v.union(v.literal("once"), v.literal("recurring")),
    cronExpr: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("completed"), v.literal("cancelled")),
    payload: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_gateway", ["gatewayId"])
    .index("by_status", ["status", "nextRunAt"])
    .index("by_user", ["userId", "status"]),

  // --- TELEGRAM AUTH ---
  telegramAllowlist: defineTable({
    telegramId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    approvedAt: v.number(),
    approvedBy: v.optional(v.string()),
  }).index("by_telegramId", ["telegramId"]),

  telegramBlocklist: defineTable({
    telegramId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    blockedAt: v.number(),
  }).index("by_telegramId", ["telegramId"]),

  telegramAccessRequests: defineTable({
    telegramId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("blocked")),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_telegramId", ["telegramId"])
    .index("by_status", ["status"]),

  // --- PUSH SUBSCRIPTIONS ---
  pushSubscriptions: defineTable({
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    userId: v.optional(v.string()),
    createdAt: v.number(),
    gatewayId: v.optional(v.id("gateways")),
  }).index("by_endpoint", ["endpoint"])
    .index("by_gatewayId", ["gatewayId"]),

  // --- WEBHOOKS ---
  webhooks: defineTable({
    gatewayId: v.id("gateways"),
    url: v.string(),
    events: v.array(v.string()),
    secret: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
    lastTriggeredAt: v.optional(v.number()),
    lastStatus: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_gateway_enabled", ["gatewayId", "enabled"]),

  // --- SCHEDULED MESSAGES ---
  scheduledMessages: defineTable({
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    userId: v.id("authUsers"),
    content: v.string(),
    scheduledFor: v.number(),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("cancelled")),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_gatewayId", ["gatewayId"])
    .index("by_status_scheduled", ["status", "scheduledFor"])
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  // --- CHANNEL MESSAGES (raw audit trail) ---
  channelMessages: defineTable({
    gatewayId: v.id("gateways"),
    channelId: v.id("channels"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    rawPayload: v.any(),
    messageId: v.optional(v.id("messages")),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("sent"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
  })
    .index("by_channelId", ["channelId"])
    .index("by_status", ["status"]),
});

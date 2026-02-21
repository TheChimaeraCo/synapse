import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  classifyTopic: vi.fn(),
  summarizeConversation: vi.fn(),
}));

vi.mock("@/lib/convex", () => ({
  convexClient: {
    query: mocks.query,
    mutation: mocks.mutation,
  },
}));

vi.mock("@/lib/topicClassifier", () => ({
  classifyTopic: mocks.classifyTopic,
}));

vi.mock("@/lib/conversationSummarizer", () => ({
  summarizeConversation: mocks.summarizeConversation,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    functions: {
      conversations: {
        getActive: "conversations.getActive",
        create: "conversations.create",
        close: "conversations.close",
        update: "conversations.update",
        updateMessageCount: "conversations.updateMessageCount",
      },
      messages: {
        listByConversation: "messages.listByConversation",
      },
    },
  },
}));

import { api } from "@/convex/_generated/api";
import { resolveConversation } from "../conversationManager";

type MockConversation = {
  _id: string;
  messageCount: number;
  lastMessageAt: number;
  depth: number;
  title?: string;
  tags?: string[];
  summary?: string;
};

type MockState = {
  active: MockConversation | null;
  recentMessages: Array<{ role: string; content: string }>;
  nextId: number;
};

let nowMs = 1_700_000_000_000;
let state: MockState;

function newActive(overrides: Partial<MockConversation> = {}): MockConversation {
  return {
    _id: "active-1",
    messageCount: 2,
    lastMessageAt: nowMs - 60_000,
    depth: 2,
    ...overrides,
  };
}

function wireConvexMocks() {
  mocks.query.mockImplementation(async (fn: any) => {
    if (fn === (api.functions.conversations.getActive as any)) return state.active;
    if (fn === (api.functions.messages.listByConversation as any)) return state.recentMessages;
    throw new Error(`Unhandled query fn: ${fn}`);
  });

  mocks.mutation.mockImplementation(async (fn: any, args: Record<string, any>) => {
    if (fn === (api.functions.conversations.create as any)) {
      const id = `convo-${state.nextId++}`;
      state.active = {
        _id: id,
        messageCount: 1,
        lastMessageAt: nowMs,
        depth: args.depth ?? 1,
        title: args.title,
        tags: args.tags,
      };
      return id;
    }
    if (fn === (api.functions.conversations.close as any)) {
      if (state.active && state.active._id === args.id) {
        state.active = null;
      }
      return null;
    }
    if (fn === (api.functions.conversations.updateMessageCount as any)) {
      if (state.active && state.active._id === args.id) {
        state.active.messageCount += 1;
        state.active.lastMessageAt = nowMs;
      }
      return null;
    }
    if (fn === (api.functions.conversations.update as any)) {
      if (state.active && state.active._id === args.id) {
        if (args.title !== undefined) state.active.title = args.title;
        if (args.tags !== undefined) state.active.tags = args.tags;
      }
      return null;
    }
    throw new Error(`Unhandled mutation fn: ${fn}`);
  });
}

describe("conversation segmentation e2e", () => {
  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    state = {
      active: null,
      recentMessages: [],
      nextId: 1,
    };

    mocks.query.mockReset();
    mocks.mutation.mockReset();
    mocks.classifyTopic.mockReset();
    mocks.summarizeConversation.mockReset();

    mocks.classifyTopic.mockResolvedValue({ sameTopic: true });
    mocks.summarizeConversation.mockResolvedValue(undefined);

    wireConvexMocks();
  });

  it("creates a new conversation on first message", async () => {
    const id = await resolveConversation("session-1" as any, "gateway-1" as any, undefined, "hello there");

    expect(id).toBe("convo-1");
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.create,
      expect.objectContaining({
        sessionId: "session-1",
        gatewayId: "gateway-1",
        depth: 1,
      })
    );
  });

  it("continues same conversation and enriches metadata on same-topic classification", async () => {
    state.active = newActive({ messageCount: 2, title: undefined, tags: [] });
    state.recentMessages = [
      { role: "user", content: "Need help with OAuth callbacks" },
      { role: "assistant", content: "Sure, let's debug it." },
    ];
    mocks.classifyTopic.mockResolvedValueOnce({
      sameTopic: true,
      suggestedTitle: "OAuth callback debugging",
      newTags: ["oauth", "auth"],
    });

    const id = await resolveConversation("session-1" as any, "gateway-1" as any, undefined, "what about refresh tokens?");

    expect(id).toBe("active-1");
    expect(mocks.classifyTopic).toHaveBeenCalledTimes(1);
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.updateMessageCount,
      { id: "active-1" }
    );
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.update,
      expect.objectContaining({
        id: "active-1",
        title: "OAuth callback debugging",
        tags: ["oauth", "auth"],
      })
    );
  });

  it("closes, summarizes, and starts unchained conversation on topic shift", async () => {
    state.active = newActive({ messageCount: 5, depth: 3 });
    state.recentMessages = [
      { role: "user", content: "Let's finish API auth setup" },
      { role: "assistant", content: "We updated token handling." },
    ];
    mocks.classifyTopic.mockResolvedValueOnce({
      sameTopic: false,
      suggestedTitle: "Dinner planning",
      newTags: ["food", "personal"],
    });

    const newId = await resolveConversation("session-1" as any, "gateway-1" as any, undefined, "what should I cook tonight?");

    expect(newId).toBe("convo-1");
    expect(mocks.mutation).toHaveBeenCalledWith(api.functions.conversations.close, { id: "active-1" });
    expect(mocks.summarizeConversation).toHaveBeenCalledWith("active-1");
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.create,
      expect.objectContaining({
        previousConvoId: undefined,
        depth: 1,
        title: "Dinner planning",
        tags: ["food", "personal"],
      })
    );
  });

  it("starts a new unchained conversation when user explicitly asks for one", async () => {
    state.active = newActive({ messageCount: 1, depth: 4 });

    const newId = await resolveConversation(
      "session-1" as any,
      "gateway-1" as any,
      undefined,
      "new topic: let's talk about workouts"
    );

    expect(newId).toBe("convo-1");
    expect(mocks.classifyTopic).not.toHaveBeenCalled();
    expect(mocks.mutation).toHaveBeenCalledWith(api.functions.conversations.close, { id: "active-1" });
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.create,
      expect.objectContaining({
        previousConvoId: undefined,
        depth: 1,
      })
    );
  });

  it("chains long-gap continuation when the new message is clearly related", async () => {
    state.active = newActive({
      messageCount: 6,
      depth: 2,
      lastMessageAt: nowMs - 9 * 60 * 60 * 1000,
      summary: "We discussed OAuth token refresh flow and callback handling for API auth.",
    });

    const newId = await resolveConversation(
      "session-1" as any,
      "gateway-1" as any,
      undefined,
      "continue oauth token refresh flow for callback handling"
    );

    expect(newId).toBe("convo-1");
    expect(mocks.classifyTopic).not.toHaveBeenCalled();
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.create,
      expect.objectContaining({
        previousConvoId: "active-1",
        depth: 3,
      })
    );
  });

  it("does not chain long-gap message when resume classification says different topic", async () => {
    state.active = newActive({
      messageCount: 3,
      depth: 5,
      lastMessageAt: nowMs - 9 * 60 * 60 * 1000,
      summary: "We discussed OAuth token refresh flow and callback handling for API auth.",
    });
    mocks.classifyTopic.mockResolvedValueOnce({ sameTopic: false });

    const newId = await resolveConversation(
      "session-1" as any,
      "gateway-1" as any,
      undefined,
      "recommend pizza in seattle"
    );

    expect(newId).toBe("convo-1");
    expect(mocks.classifyTopic).toHaveBeenCalledTimes(1);
    expect(mocks.mutation).toHaveBeenCalledWith(
      api.functions.conversations.create,
      expect.objectContaining({
        previousConvoId: undefined,
        depth: 1,
      })
    );
  });
});

import { describe, it, expect } from "vitest";
import { detectNewConversationIntent, checkTopicRelation } from "../conversationManager";

describe("detectNewConversationIntent", () => {
  it("detects 'new topic' intent", () => {
    expect(detectNewConversationIntent("new topic please")).toBe(true);
    expect(detectNewConversationIntent("new conversation")).toBe(true);
    expect(detectNewConversationIntent("let's start a new chat")).toBe(true); // matches "new chat" pattern
  });

  it("detects 'change subject' intent", () => {
    expect(detectNewConversationIntent("change the subject")).toBe(true);
    expect(detectNewConversationIntent("change topic")).toBe(true);
  });

  it("detects 'move on' intent", () => {
    expect(detectNewConversationIntent("let's move on")).toBe(true);
  });

  it("detects 'start fresh' intent", () => {
    expect(detectNewConversationIntent("start a fresh conversation")).toBe(true);
    expect(detectNewConversationIntent("start new")).toBe(true);
  });

  it("detects 'different topic' intent", () => {
    expect(detectNewConversationIntent("different topic")).toBe(true);
    expect(detectNewConversationIntent("different subject")).toBe(true);
  });

  it("detects 'anyway' followed by text", () => {
    expect(detectNewConversationIntent("anyway, what about lunch?")).toBe(true);
  });

  it("detects compound intent patterns", () => {
    expect(detectNewConversationIntent("ok, new topic")).toBe(true);
    expect(detectNewConversationIntent("alright, moving on")).toBe(true);
  });

  it("returns false for normal messages", () => {
    expect(detectNewConversationIntent("how's the weather?")).toBe(false);
    expect(detectNewConversationIntent("tell me about TypeScript")).toBe(false);
    expect(detectNewConversationIntent("thanks for the help")).toBe(false);
    expect(detectNewConversationIntent("")).toBe(false);
  });
});

describe("checkTopicRelation", () => {
  it("returns false for empty summary", () => {
    expect(checkTopicRelation("", "hello world")).toBe(false);
  });

  it("returns false for short words only (<=3 chars filtered)", () => {
    expect(checkTopicRelation("the and for", "the and for")).toBe(false);
  });

  it("returns true when 2+ significant words overlap", () => {
    expect(checkTopicRelation(
      "discussing TypeScript generics and interfaces",
      "how do TypeScript interfaces work with generics?"
    )).toBe(true);
  });

  it("returns false when fewer than 2 words overlap", () => {
    expect(checkTopicRelation(
      "discussing TypeScript generics",
      "what should I cook for dinner tonight?"
    )).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(checkTopicRelation(
      "TYPESCRIPT GENERICS discussion",
      "typescript generics are great"
    )).toBe(true);
  });
});

describe("classification threshold logic", () => {
  // The logic: shouldClassify = nextCount >= 3
  // So classification starts at message 3 and runs on every message after.

  function shouldClassify(messageCount: number): boolean {
    const nextCount = messageCount + 1;
    return nextCount >= 3;
  }

  it("does not classify before message 3", () => {
    for (let i = 0; i < 2; i++) {
      expect(shouldClassify(i)).toBe(false);
    }
  });

  it("classifies at message 3 (nextCount=3)", () => {
    expect(shouldClassify(2)).toBe(true);
  });

  it("classifies every message from message 3 onward", () => {
    expect(shouldClassify(2)).toBe(true); // nextCount=3
    expect(shouldClassify(3)).toBe(true); // nextCount=4
    expect(shouldClassify(4)).toBe(true); // nextCount=5
    expect(shouldClassify(9)).toBe(true); // nextCount=10
  });
});

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
  // The logic: shouldClassify = nextCount >= 6 && (nextCount - 6) % 3 === 0
  // So it fires at messages 6, 9, 12, 15, ...

  function shouldClassify(messageCount: number): boolean {
    const nextCount = messageCount + 1;
    return nextCount >= 6 && (nextCount - 6) % 3 === 0;
  }

  it("does not classify before message 6", () => {
    for (let i = 0; i < 5; i++) {
      expect(shouldClassify(i)).toBe(false);
    }
  });

  it("classifies at message 6 (nextCount=6)", () => {
    expect(shouldClassify(5)).toBe(true);
  });

  it("classifies every 3rd message after 6", () => {
    expect(shouldClassify(8)).toBe(true);   // nextCount=9
    expect(shouldClassify(11)).toBe(true);  // nextCount=12
    expect(shouldClassify(14)).toBe(true);  // nextCount=15
  });

  it("does not classify between intervals", () => {
    expect(shouldClassify(6)).toBe(false);  // nextCount=7
    expect(shouldClassify(7)).toBe(false);  // nextCount=8
    expect(shouldClassify(9)).toBe(false);  // nextCount=10
    expect(shouldClassify(10)).toBe(false); // nextCount=11
  });
});

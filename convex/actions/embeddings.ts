"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Process knowledge entries that are missing embeddings.
 * Fetches entries without embeddings, generates them via OpenAI, stores them back.
 */
export const processQueue = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get entries missing embeddings
    const entries = await ctx.runQuery(internal.functions.knowledge.getMissingEmbeddings, {
      limit: 50,
    });

    if (entries.length === 0) return { processed: 0 };

    // Get OpenAI key from config
    const openaiKey = await ctx.runQuery(internal.functions.config.getInternal, {
      key: "openai_api_key",
    });

    if (!openaiKey) {
      // No OpenAI key - generate TF-IDF embeddings instead
      const allEntries = await ctx.runQuery(internal.functions.knowledge.getAllContent, {});
      const texts = allEntries.map((e: any) => `${e.key} ${e.value}`);

      // Build vocab/IDF from corpus
      const { buildVocabulary, computeIDF, tfidfVector } = await import("../../lib/embeddings");
      const vocab = buildVocabulary(texts);
      const idf = computeIDF(vocab, texts);

      let processed = 0;
      for (const entry of entries) {
        const text = `${entry.key} ${entry.value}`;
        const embedding = tfidfVector(text, vocab, idf);
        await ctx.runMutation(internal.functions.knowledge.setEmbedding, {
          id: entry._id,
          embedding,
          embeddingModel: "tfidf-local",
        });
        processed++;
      }
      return { processed, model: "tfidf-local" };
    }

    // Use OpenAI embeddings API (batch)
    const texts = entries.map((e: any) => `${e.key} ${e.value}`);
    const { generateEmbeddingBatch } = await import("../../lib/embeddings");
    const embeddings = await generateEmbeddingBatch(texts, openaiKey);

    let processed = 0;
    for (let i = 0; i < entries.length; i++) {
      const emb = embeddings[i];
      if (emb) {
        await ctx.runMutation(internal.functions.knowledge.setEmbedding, {
          id: entries[i]._id,
          embedding: emb,
          embeddingModel: "text-embedding-3-small",
        });
        processed++;
      }
    }

    return { processed, model: "text-embedding-3-small" };
  },
});

/**
 * Generate embedding for a single knowledge entry.
 */
export const generateSingle = internalAction({
  args: {
    knowledgeId: v.id("knowledge"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.runQuery(internal.functions.knowledge.getById, {
      id: args.knowledgeId,
    });
    if (!entry) return;

    const openaiKey = await ctx.runQuery(internal.functions.config.getInternal, {
      key: "openai_api_key",
    });

    const text = `${entry.key} ${entry.value}`;
    const { generateEmbeddingOpenAI } = await import("../../lib/embeddings");

    if (openaiKey) {
      const emb = await generateEmbeddingOpenAI(text, openaiKey);
      if (emb) {
        await ctx.runMutation(internal.functions.knowledge.setEmbedding, {
          id: args.knowledgeId,
          embedding: emb,
          embeddingModel: "text-embedding-3-small",
        });
        return;
      }
    }

    // No key or API failed - skip, will be picked up by batch job
    console.log(`Skipping embedding for ${args.knowledgeId} - no OpenAI key or API failed`);
  },
});

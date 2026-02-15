/**
 * Semantic Search via Vector Embeddings
 * 
 * Supports OpenAI embeddings API (text-embedding-3-small) with
 * a TF-IDF fallback when no embedding API is available.
 */

// --- Stop words for TF-IDF fallback ---
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "it", "its", "i", "me", "my", "we", "our", "you", "your", "he", "him",
  "his", "she", "her", "they", "them", "their", "this", "that", "these",
  "those", "what", "which", "who", "whom", "am",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// --- Cosine Similarity ---
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// --- TF-IDF Fallback Embedding ---

/** Build a vocabulary from a corpus of texts */
export function buildVocabulary(texts: string[]): string[] {
  const vocab = new Set<string>();
  for (const t of texts) {
    for (const w of tokenize(t)) vocab.add(w);
  }
  return Array.from(vocab).sort();
}

/** Compute IDF values for a vocabulary given a corpus */
export function computeIDF(vocab: string[], texts: string[]): Map<string, number> {
  const docCount = texts.length || 1;
  const idf = new Map<string, number>();
  const docFreq = new Map<string, number>();

  for (const t of texts) {
    const words = new Set(tokenize(t));
    words.forEach((w) => {
      docFreq.set(w, (docFreq.get(w) || 0) + 1);
    });
  }

  for (const w of vocab) {
    const df = docFreq.get(w) || 0;
    idf.set(w, Math.log((docCount + 1) / (df + 1)) + 1);
  }
  return idf;
}

/** Generate a TF-IDF vector for a text given vocab and IDF */
export function tfidfVector(text: string, vocab: string[], idf: Map<string, number>): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  let maxTf = 1;
  tf.forEach((v) => { if (v > maxTf) maxTf = v; });

  return vocab.map((w) => {
    const raw = tf.get(w) || 0;
    return (raw / maxTf) * (idf.get(w) || 1);
  });
}

// --- OpenAI Embeddings API ---

export async function generateEmbeddingOpenAI(
  text: string,
  apiKey: string,
  model: string = "text-embedding-3-small"
): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 8000), // limit input size
        model,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export async function generateEmbeddingBatch(
  texts: string[],
  apiKey: string,
  model: string = "text-embedding-3-small"
): Promise<(number[] | null)[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts.map((t) => t.slice(0, 8000)),
        model,
      }),
    });
    if (!res.ok) return texts.map(() => null);
    const data = await res.json();
    // Sort by index to maintain order
    const sorted = (data?.data || []).sort((a: any, b: any) => a.index - b.index);
    return sorted.map((d: any) => d.embedding ?? null);
  } catch {
    return texts.map(() => null);
  }
}

// --- Main API ---

/**
 * Generate embedding for a text. Tries OpenAI first, falls back to TF-IDF.
 * For TF-IDF, you must provide corpus for meaningful results.
 */
export async function generateEmbedding(
  text: string,
  options: {
    openaiKey?: string;
    model?: string;
    corpus?: string[];
    vocab?: string[];
    idf?: Map<string, number>;
  } = {}
): Promise<{ embedding: number[]; model: string }> {
  // Try OpenAI first
  if (options.openaiKey) {
    const emb = await generateEmbeddingOpenAI(text, options.openaiKey, options.model);
    if (emb) return { embedding: emb, model: options.model || "text-embedding-3-small" };
  }

  // Fallback to TF-IDF
  const corpus = options.corpus || [text];
  const vocab = options.vocab || buildVocabulary(corpus);
  const idf = options.idf || computeIDF(vocab, corpus);
  return { embedding: tfidfVector(text, vocab, idf), model: "tfidf-local" };
}

/**
 * Search knowledge entries by semantic similarity.
 */
export async function searchByEmbedding(
  query: string,
  knowledge: Array<{ content: string; embedding?: number[]; _id: string }>,
  options: { openaiKey?: string; topK?: number } = {}
): Promise<Array<{ id: string; content: string; score: number }>> {
  const topK = options.topK || 5;

  // Entries with embeddings
  const withEmbeddings = knowledge.filter((k) => k.embedding && k.embedding.length > 0);

  if (withEmbeddings.length === 0) {
    // Pure TF-IDF fallback over all content
    const texts = knowledge.map((k) => k.content);
    const vocab = buildVocabulary([query, ...texts]);
    const idf = computeIDF(vocab, texts);
    const queryVec = tfidfVector(query, vocab, idf);

    return knowledge
      .map((k) => ({
        id: k._id,
        content: k.content,
        score: cosineSimilarity(queryVec, tfidfVector(k.content, vocab, idf)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // Generate query embedding matching the stored embeddings
  let queryEmbedding: number[];
  if (options.openaiKey) {
    const emb = await generateEmbeddingOpenAI(query, options.openaiKey);
    if (emb) {
      queryEmbedding = emb;
    } else {
      // Fallback: TF-IDF for all
      const texts = knowledge.map((k) => k.content);
      const vocab = buildVocabulary([query, ...texts]);
      const idf = computeIDF(vocab, texts);
      const queryVec = tfidfVector(query, vocab, idf);
      return knowledge
        .map((k) => ({
          id: k._id,
          content: k.content,
          score: cosineSimilarity(queryVec, tfidfVector(k.content, vocab, idf)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
  } else {
    // No API key - TF-IDF for all
    const texts = knowledge.map((k) => k.content);
    const vocab = buildVocabulary([query, ...texts]);
    const idf = computeIDF(vocab, texts);
    const queryVec = tfidfVector(query, vocab, idf);
    return knowledge
      .map((k) => ({
        id: k._id,
        content: k.content,
        score: cosineSimilarity(queryVec, tfidfVector(k.content, vocab, idf)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // Compare query embedding against stored embeddings
  return withEmbeddings
    .map((k) => ({
      id: k._id,
      content: k.content,
      score: cosineSimilarity(queryEmbedding, k.embedding!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

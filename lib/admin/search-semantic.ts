// Semantic layer for the admin ⌘K search. Embeds each manifest entry's text
// (label + description + keywords) and the live query with OpenAI, then ranks by
// cosine similarity — so "where do I refund someone" finds Payments/Disputes
// even without the literal word. Best-effort: returns null when OpenAI is
// unavailable, and the search route falls back to keyword-only (Fuse). Never
// throws, never blocks the keyword path.
import { ADMIN_SEARCH_MANIFEST, type AdminSearchItem } from './search-manifest';

const EMBED_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';

// What we embed per page — name, purpose, and synonyms in one string.
function itemText(i: AdminSearchItem): string {
  return `${i.label}. ${i.description}. ${i.keywords.join(', ')}`;
}

async function embed(inputs: string[]): Promise<number[][] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || inputs.length === 0) return null;
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, input: inputs }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding: number[] }[] };
    if (!data.data || data.data.length !== inputs.length) return null;
    return data.data.map((d) => d.embedding);
  } catch {
    return null;
  }
}

// Per-isolate cache of the manifest embeddings — static until a deploy changes
// the manifest. Keyed on the joined ids so a manifest edit invalidates it.
let cache: { key: string; vecs: Map<string, number[]> } | null = null;

async function manifestEmbeddings(): Promise<Map<string, number[]> | null> {
  const key = ADMIN_SEARCH_MANIFEST.map((i) => i.id).join('|');
  if (cache && cache.key === key) return cache.vecs;
  const vecs = await embed(ADMIN_SEARCH_MANIFEST.map(itemText));
  if (!vecs) return null;
  const map = new Map<string, number[]>();
  ADMIN_SEARCH_MANIFEST.forEach((i, idx) => map.set(i.id, vecs[idx]));
  cache = { key, vecs: map };
  return map;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Map of manifest item id → semantic similarity (0..1) for `query`, or null when
 * embeddings are unavailable (caller should fall back to keyword search).
 */
export async function semanticScores(query: string): Promise<Map<string, number> | null> {
  const itemVecs = await manifestEmbeddings();
  if (!itemVecs) return null;
  const q = await embed([query]);
  if (!q?.[0]) return null;
  const qv = q[0];
  const out = new Map<string, number>();
  for (const [id, vec] of itemVecs) out.set(id, cosine(qv, vec));
  return out;
}

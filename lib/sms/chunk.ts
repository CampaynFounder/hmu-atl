// Semantic SMS chunker.
//
// VoIP.ms rejects messages over 160 GSM-7 chars with `sms_toolong` (see
// lib/sms/textbee.ts). We target 150 to leave headroom for smart quotes and
// accented characters that count as 2 bytes in GSM-7.
//
// The splitter prefers natural break points so a chunked reply still reads
// like a person texting in bursts:
//   1. sentence boundary (`. ! ?` followed by space)
//   2. clause boundary (`, ; : — –` followed by space)
//   3. word boundary (any whitespace), avoiding orphaned single-letter words
//   4. hard cut at maxLen (only as a last resort, e.g. an unbreakable URL)

export const SMS_CHUNK_MAX = 150;

// How far back from maxLen we'll accept a sentence/clause break before falling
// through to the next strategy. Keeping a floor prevents tiny chunks like a
// 12-char first message followed by a 148-char second message.
const SENTENCE_FLOOR_RATIO = 0.5;
const CLAUSE_FLOOR_RATIO = 0.6;

const SENTENCE_END = new Set(['.', '!', '?']);
const CLAUSE_END = new Set([',', ';', ':', '—', '–']);

export function chunkSms(text: string, maxLen: number = SMS_CHUNK_MAX): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks: string[] = [];
  let remaining = cleaned;

  while (remaining.length > maxLen) {
    const breakAt = findBreakPoint(remaining, maxLen);
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);

  return chunks;
}

function findBreakPoint(text: string, maxLen: number): number {
  const windowEnd = Math.min(maxLen, text.length);

  // 1. Sentence boundary
  const sentenceFloor = Math.floor(maxLen * SENTENCE_FLOOR_RATIO);
  for (let i = windowEnd - 1; i >= sentenceFloor; i--) {
    if (SENTENCE_END.has(text[i]) && (i + 1 >= text.length || text[i + 1] === ' ')) {
      return i + 1;
    }
  }

  // 2. Clause boundary
  const clauseFloor = Math.floor(maxLen * CLAUSE_FLOOR_RATIO);
  for (let i = windowEnd - 1; i >= clauseFloor; i--) {
    if (CLAUSE_END.has(text[i]) && (i + 1 >= text.length || text[i + 1] === ' ')) {
      return i + 1;
    }
  }

  // 3. Word boundary, skipping breaks that would orphan a single-letter word
  //    like "I" or "a" at the end of the chunk.
  for (let i = Math.min(windowEnd, text.length - 1); i >= 1; i--) {
    if (text[i] === ' ') {
      const before = text.slice(0, i);
      const lastWord = before.match(/\S+$/)?.[0] ?? '';
      if (lastWord.length === 1 && /[A-Za-z]/.test(lastWord)) continue;
      return i;
    }
  }

  // 4. No whitespace found — hard cut.
  return maxLen;
}

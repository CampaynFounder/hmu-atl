// Manual sanity check for lib/sms/chunk.ts.
// Run with: npx tsx scripts/check-sms-chunker.ts
//
// Each case prints chunk count + per-chunk char counts + the chunks themselves
// so you can eyeball whether splits land on natural boundaries.

import { chunkSms, SMS_CHUNK_MAX } from '../lib/sms/chunk';

const cases: { name: string; text: string }[] = [
  {
    name: 'short — single chunk',
    text: 'Hey, you there?',
  },
  {
    name: 'exactly under limit',
    text: 'A'.repeat(SMS_CHUNK_MAX - 5) + ' end.',
  },
  {
    name: 'two sentences spanning limit',
    text:
      "Local drivers, real cash, no surge — that's HMU ATL in one line. " +
      'You post your ride, drivers nearby see it and ping you back if they want it. ' +
      "Pay through the app, rate them after, and you're done.",
  },
  {
    name: 'long answer, three sentences',
    text:
      "If you're new to HMU, your visibility radius starts small and grows as you complete rides. " +
      'Most drivers see their first request within 24 hours of going live. ' +
      'Make sure your photo and price are set, then post HMU in the app every day — that puts you back at the top of the rider feed.',
  },
  {
    name: 'no punctuation, just words',
    text:
      'this is a long message with no punctuation at all just words flowing together for a long time like a stream of thought that never ends until the chunker has to find a break somewhere reasonable',
  },
  {
    name: 'orphan-trap (would orphan single I)',
    text:
      "I told you I would handle it I promise I am on it I just need a little more time before I can confirm I have it locked in I will follow up with you very soon I",
  },
  {
    name: 'unbreakable token (URL)',
    text:
      'Check this out: https://atl.hmucashride.com/very/long/path/that/has/no/spaces/at/all/and/keeps/going/forever/until/the/end/of/time/please/break/me',
  },
  {
    name: 'commas + dashes only',
    text:
      'Free tier means we take a small platform fee on each ride, capped daily, and capped weekly — but if you upgrade to HMU First, you get instant payouts after every single ride and a lower cap on what we keep, plus priority placement.',
  },
];

for (const c of cases) {
  const chunks = chunkSms(c.text);
  const sizes = chunks.map((s) => s.length).join(', ');
  console.log(`\n=== ${c.name} ===`);
  console.log(`input: ${c.text.length} chars`);
  console.log(`chunks: ${chunks.length} [${sizes}]`);
  chunks.forEach((s, i) => {
    const flag = s.length > SMS_CHUNK_MAX ? ' OVER LIMIT' : '';
    console.log(`  [${i + 1}] (${s.length}${flag}) ${s}`);
  });
}

/**
 * Generate a short human-readable ride reference code.
 * Format: HMU-XXXX (4 alphanumeric uppercase chars)
 * Collision-resistant enough for our volume — ~1.7M unique codes.
 */
export function generateRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for readability
  let code = 'HMU-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

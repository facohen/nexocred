/**
 * Device-side UUIDv7 generator for La Ruta. The id is the IDENTITY of an
 * offline visit/payment: it is stamped once on the device, queued in IndexedDB,
 * and replayed in the sync batch. The backend uses the same id as the
 * idempotency key, so a retried sync never duplicates a stop or payment.
 *
 * UUIDv7 = 48-bit Unix-ms timestamp + version (7) + 74 random bits + variant.
 * Time-ordered so the queue replays roughly in capture order.
 */
export function uuidv7(): string {
  const ms = Date.now();
  const rand = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
  } else {
    for (let i = 0; i < rand.length; i++) rand[i] = Math.floor(Math.random() * 256);
  }

  const bytes = new Uint8Array(16);
  // 48-bit big-endian timestamp.
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;
  // version 7 in the high nibble of byte 6.
  bytes[6] = 0x70 | (rand[0] & 0x0f);
  bytes[7] = rand[1];
  // variant (10xx) in byte 8.
  bytes[8] = 0x80 | (rand[2] & 0x3f);
  bytes[9] = rand[3];
  bytes[10] = rand[4];
  bytes[11] = rand[5];
  bytes[12] = rand[6];
  bytes[13] = rand[7];
  bytes[14] = rand[8];
  bytes[15] = rand[9];

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

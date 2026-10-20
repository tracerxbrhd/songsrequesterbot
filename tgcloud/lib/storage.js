import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users, audioCache } from '../schema.js';
import { REQUEST_COOLDOWN_SECONDS } from './config.js';

const now = () => Math.floor(Date.now() / 1000);

export async function throttle(userId) {
  await db.insert(users).values({ tgId: userId, createdAt: now() })
    .onConflictDoNothing().run();
  const t = now();
  const r = await db.run(
    'UPDATE songs_users SET last_request_at = :now WHERE tg_id = :id AND last_request_at <= :earliest',
    { ':now': t, ':id': userId, ':earliest': t - REQUEST_COOLDOWN_SECONDS },
  );
  return r.rowsAffected === 1;
}

export async function cachedFile(key) {
  const record = await db.select().from(audioCache).where(eq(audioCache.cacheKey, key)).get();
  return record?.fileId || null;
}

export async function cacheFile(key, fileId) {
  await db.insert(audioCache).values({ cacheKey: key, fileId, updatedAt: now() })
    .onConflictDoUpdate({
      target: audioCache.cacheKey,
      set: { fileId, updatedAt: now() },
    }).run();
}

export async function uncacheFile(key) {
  await db.delete(audioCache).where(eq(audioCache.cacheKey, key)).run();
}

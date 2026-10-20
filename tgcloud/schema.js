import { table, integer, text } from 'sdk/db';

export const users = table('songs_users', {
  tgId: integer('tg_id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  lastRequestAt: integer('last_request_at').notNull().default(0),
});

export const audioCache = table('songs_audio_cache', {
  cacheKey: text('cache_key').primaryKey(),
  fileId: text('file_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

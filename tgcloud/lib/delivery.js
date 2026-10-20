import { api, fetch, InputFile } from 'sdk';
import { MAX_IN_MEMORY_AUDIO_BYTES } from './config.js';
import { cachedFile, cacheFile, uncacheFile } from './storage.js';
import { isJamendoUrl } from './pure.js';

async function downloadAsBytes(url) {
  if (!isJamendoUrl(url)) throw new Error('AUDIO_URL_NOT_TRUSTED');
  const res = await fetch(url, { headers: { Accept: 'audio/mpeg, audio/mp4, application/octet-stream' } });
  if (!res.ok) throw new Error('AUDIO_HTTP_' + res.status);
  const size = Number(res.headers.get('content-length') || '0');
  if (size > MAX_IN_MEMORY_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE');
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['audio/mpeg', 'audio/mp3', 'application/octet-stream', 'audio/mp4', 'audio/x-m4a'].includes(contentType)) {
    throw new Error('AUDIO_WRONG_CONTENT_TYPE');
  }

  const parts = [];
  let total = 0;
  for await (const chunk of res.body) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += bytes.byteLength;
    if (total > MAX_IN_MEMORY_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE');
    parts.push(bytes);
  }
  if (!total) throw new Error('AUDIO_EMPTY');
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of parts) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export async function deliverAudio(chatId, track) {
  if (track?.source !== 'j' || !track.downloadAllowed || !isJamendoUrl(track.downloadUrl)) {
    return { status: 'forbidden' };
  }
  const key = 'j:' + track.id + ':mp32';
  const metadata = { chat_id: chatId, title: track.title, performer: track.artist };
  const fileId = await cachedFile(key);
  if (fileId) {
    try {
      await api.sendAudio({ ...metadata, audio: fileId });
      return { status: 'cached' };
    } catch (e) {
      const details = String(e?.description || e?.message || '');
      if (!/wrong file identifier|file_id|file identifier/i.test(details)) throw e;
      await uncacheFile(key);
    }
  }
  let result;
  try {
    // Best case: Telegram fetches the permitted Jamendo file itself.
    result = await api.sendAudio({ ...metadata, audio: track.downloadUrl });
  } catch (e) {
    // Do not retry unknown errors: the first send may have succeeded.
    const details = String(e?.description || e?.message || '');
    if (!/failed to get http url|wrong type of the web page content|url host is empty|can't parse inputmedia|wrong file identifier|http url/i.test(details)) throw e;
    const bytes = await downloadAsBytes(track.downloadUrl);
    result = await api.sendAudio({
      ...metadata,
      audio: new InputFile(bytes, track.id + '.mp3', { type: 'audio/mpeg' }),
    });
  }
  if (result?.audio?.file_id) await cacheFile(key, result.audio.file_id);
  return { status: 'sent' };
}

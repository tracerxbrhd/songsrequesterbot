import { api, fetch, InputFile } from 'sdk';
import { MAX_IN_MEMORY_AUDIO_BYTES } from './config.js';
import { cachedFile, cacheFile, uncacheFile } from './storage.js';
import { isJamendoUrl, isYandexAudioUrl } from './pure.js';
import { getYandexRawMp3 } from './providers/yandex.js';

function trustedAudioUrl(url, source) {
  return source === 'y' ? isYandexAudioUrl(url) :
    source === 'j' ? isJamendoUrl(url) : false;
}

async function downloadAsBytes(url, source) {
  if (!trustedAudioUrl(url, source)) throw new Error('AUDIO_URL_NOT_TRUSTED');
  const res = await fetch(url, {
    headers: { Accept: 'audio/mpeg, application/octet-stream' },
  });
  if (!res.ok) throw new Error('AUDIO_HTTP_' + res.status);
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_IN_MEMORY_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE');

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['audio/mpeg', 'audio/mp3', 'application/octet-stream', 'binary/octet-stream'].includes(contentType)) {
    throw new Error('AUDIO_WRONG_CONTENT_TYPE');
  }

  const chunks = [];
  let sizeRead = 0;
  for await (const chunk of res.body) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    sizeRead += bytes.byteLength;
    if (sizeRead > MAX_IN_MEMORY_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE');
    chunks.push(bytes);
  }
  if (!sizeRead) throw new Error('AUDIO_EMPTY');
  const output = new Uint8Array(sizeRead);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function canRetryAsBytes(error) {
  const text = String(error?.description || error?.message || '').toLowerCase();
  return /failed to get http url|wrong type of the web page content|url host is empty|wrong file identifier|http url|wrong type of url host|failed to get http url content/.test(text);
}

export async function deliverAudio(chatId, track) {
  if (!track || !['y', 'j'].includes(track.source)) return { status: 'forbidden' };
  if (track.source === 'j' && (!track.downloadAllowed || !isJamendoUrl(track.downloadUrl))) {
    return { status: 'forbidden' };
  }

  const key = track.source + ':' + track.id + ':mp3';
  const metadata = {
    chat_id: chatId,
    title: String(track.title).slice(0, 64),
    performer: String(track.artist).slice(0, 64),
  };

  const fileId = await cachedFile(key);
  if (fileId) {
    try {
      await api.sendAudio({ ...metadata, audio: fileId });
      return { status: 'cached' };
    } catch (error) {
      const description = String(error?.description || error?.message || '');
      if (!/wrong file identifier|file_id|file identifier/i.test(description)) throw error;
      await uncacheFile(key);
    }
  }

  // Never persist time-limited CDN links. Resolve immediately before sending.
  const info = track.source === 'y'
    ? await getYandexRawMp3(track.id)
    : { url: track.downloadUrl, size: null };

  const url = info.url;
  if (!trustedAudioUrl(url, track.source)) throw new Error('AUDIO_URL_NOT_TRUSTED');
  if (info.size && info.size > 50 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE');

  let message;
  try {
    // Prefer Telegram URL ingest: no byte buffering inside the serverless isolate.
    message = await api.sendAudio({ ...metadata, audio: url });
  } catch (error) {
    // Unknown failures may have sent an audio already. Never retry blindly.
    if (!canRetryAsBytes(error)) throw error;
    const bytes = await downloadAsBytes(url, track.source);
    message = await api.sendAudio({
      ...metadata,
      audio: new InputFile(bytes, String(track.id) + '.mp3', { type: 'audio/mpeg' }),
    });
  }

  if (message?.audio?.file_id) await cacheFile(key, message.audio.file_id);
  return { status: 'sent' };
}

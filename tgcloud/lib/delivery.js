import { api } from 'sdk';
import { cachedFile, cacheFile, uncacheFile } from './storage.js';
import { isJamendoUrl, isYandexAudioUrl } from './pure.js';
import { getYandexRawMp3 } from './providers/yandex.js';

function trustedAudioUrl(url, source) {
  return source === 'y' ? isYandexAudioUrl(url) :
    source === 'j' ? isJamendoUrl(url) : false;
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
      // Only remove known-stale file IDs. An unknown error might mean delivery
      // succeeded; don't blindly retry and send duplicate music.
      const description = String(error?.description || error?.message || '');
      if (!/wrong file identifier|file_id|file identifier/i.test(description)) throw error;
      await uncacheFile(key);
    }
  }

  const info = track.source === 'y'
    ? await getYandexRawMp3(track.id)
    : { url: track.downloadUrl, size: null };
  if (!trustedAudioUrl(info.url, track.source)) throw new Error('AUDIO_URL_NOT_TRUSTED');
  if (info.size && info.size > 50 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE');

  let sent;
  try {
    // Telegram, not the Serverless sandbox, fetches the remote file.
    // sdk.fetch is text-only: it is not a reliable MP3 byte downloader.
    sent = await api.sendAudio({ ...metadata, audio: info.url });
  } catch (_) {
    // Never include the temporary CDN URL in logs or Telegram errors.
    throw new Error('AUDIO_TELEGRAM_URL_REJECTED');
  }

  if (sent?.audio?.file_id) await cacheFile(key, sent.audio.file_id);
  return { status: 'sent' };
}

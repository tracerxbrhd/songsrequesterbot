import { api } from 'sdk';
import { cachedFile, cacheFile, uncacheFile } from './storage.js';
import { isYandexAudioUrl, validTrackId } from './pure.js';
import { getYandexRawMp3 } from './providers/yandex.js';

export async function deliverAudio(chatId, track) {
  if (!track || !validTrackId(String(track.id))) return { status: 'forbidden' };
  const key = 'y:' + track.id + ':mp3';
  const metadata = {
    chat_id: chatId,
    title: String(track.title || 'Трек').slice(0, 64),
    performer: String(track.artist || '').slice(0, 64),
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

  // A raw MP3 URL is short-lived: request it only at delivery time.
  const info = await getYandexRawMp3(track.id);
  if (!isYandexAudioUrl(info.url)) throw new Error('YANDEX_UNTRUSTED_AUDIO_URL');
  if (info.size && info.size > 50 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE');

  // Telegram fetches the remote file itself. Serverless sdk.fetch does not
  // support safely buffering arbitrary binary MP3 response bodies.
  let sent;
  try {
    sent = await api.sendAudio({ ...metadata, audio: info.url });
  } catch (_) {
    throw new Error('AUDIO_TELEGRAM_URL_REJECTED');
  }
  if (sent?.audio?.file_id) await cacheFile(key, sent.audio.file_id);
  return { status: 'sent' };
}

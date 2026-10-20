import { fetch } from 'sdk';
import { YANDEX_OAUTH_TOKEN } from '../runtime-secrets.js';
import { yandexFileInfoSignature } from '../crypto-hmac.js';
import { isYandexAudioUrl, validTrackId } from '../pure.js';
import { normalizeYandex } from './normalize.js';

const API = 'https://api.music.yandex.net';
const CLIENT = 'YandexMusicDesktopAppWindows/5.95.0';

async function getJson(path) {
  const headers = { Accept: 'application/json', 'X-Yandex-Music-Client': CLIENT };
  if (YANDEX_OAUTH_TOKEN) headers.Authorization = 'OAuth ' + YANDEX_OAUTH_TOKEN;
  const response = await fetch(API + path, { headers });
  if (response.status === 401 || response.status === 403) throw new Error('YANDEX_AUTH_FAILED');
  if (!response.ok) throw new Error('YANDEX_HTTP_' + response.status);
  const json = await response.json();
  if (json?.error) throw new Error('YANDEX_API_ERROR');
  return json;
}

export function hasYandexOAuth() {
  return Boolean(YANDEX_OAUTH_TOKEN);
}

export async function getYandexTrack(id) {
  if (!validTrackId(id)) return null;
  const json = await getJson('/tracks/' + encodeURIComponent(id));
  const items = Array.isArray(json?.result) ? json.result : [];
  return normalizeYandex(items[0]);
}

export async function searchYandex(query) {
  const url = '/search?type=track&page=0&text=' + encodeURIComponent(query);
  const json = await getJson(url);
  const tracks = json?.result?.tracks?.results;
  return (Array.isArray(tracks) ? tracks : []).slice(0, 5).map(normalizeYandex).filter(Boolean);
}

// Request only normal, unencrypted MP3 transport for tracks available to this OAuth account.
// Some catalog items are encraw-only or unavailable; they must NOT be decrypted or retried
// through a protected stream. URLs are short-lived: call immediately before sending.
export async function getYandexRawMp3(trackId) {
  if (!YANDEX_OAUTH_TOKEN) throw new Error('YANDEX_TOKEN_MISSING');
  if (!validTrackId(trackId)) throw new Error('YANDEX_TRACK_INVALID');
  for (const quality of ['hq', 'nq']) {
    const timestamp = Math.floor(Date.now() / 1000);
    const codecs = ['mp3'];
    const transport = 'raw';
    const query = new URLSearchParams({
      ts: String(timestamp), trackId,
      quality, codecs: codecs.join(','), transports: transport,
      sign: yandexFileInfoSignature(trackId, quality, codecs, transport, timestamp),
    });
    const json = await getJson('/get-file-info?' + query);
    const info = json?.result?.downloadInfo ?? json?.downloadInfo;
    if (!info) continue;
    // Fail closed even when the API presents an encryption key.
    if (info.transport !== 'raw' || info.codec !== 'mp3') continue;
    const candidates = [info.url, ...(Array.isArray(info.urls) ? info.urls : [])];
    const url = candidates.find(isYandexAudioUrl);
    if (!url) throw new Error('YANDEX_UNTRUSTED_AUDIO_URL');
    return { url, bitrate: Number(info.bitrate) || null,
      size: Number(info.size) || null, quality };
  }
  throw new Error('YANDEX_RAW_MP3_UNAVAILABLE');
}

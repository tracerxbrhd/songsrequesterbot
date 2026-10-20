import { fetch } from 'sdk';
import { YANDEX_OAUTH_TOKEN } from '../runtime-secrets.js';
import { yandexFileInfoSignature } from '../crypto-hmac.js';
import { encodeQueryParams, isYandexAudioUrl, validTrackId } from '../pure.js';
import { normalizeYandex } from './normalize.js';
import {
  yandexHeaders, yandexHttpError, unwrapYandexEnvelope, parseTrackResult, parseSearchResult,
  safeYandexErrorCode,
} from './yandex-protocol.js';

const API = 'https://api.music.yandex.net';

// All sensitive response content stays on the Yandex side: only whitelisted
// status/error codes may be reported to Telegram or logs.
async function getResult(path, profile = 'android') {
  let response;
  try {
    response = await fetch(API + path, {
      headers: yandexHeaders(YANDEX_OAUTH_TOKEN, profile),
    });
  } catch (_) {
    throw new Error('YANDEX_NETWORK');
  }
  if (!response?.ok) throw new Error(yandexHttpError(response?.status));

  let envelope;
  try {
    envelope = await response.json();
  } catch (_) {
    throw new Error('YANDEX_JSON_INVALID');
  }
  return unwrapYandexEnvelope(envelope, profile);
}

export function hasYandexOAuth() {
  // Presence is NOT validity. /diagnose performs actual requests.
  return Boolean(YANDEX_OAUTH_TOKEN);
}

export async function getYandexTrack(id) {
  if (!validTrackId(id)) return null;
  const result = await getResult('/tracks/' + encodeURIComponent(id));
  const items = parseTrackResult(result);
  return normalizeYandex(items[0]);
}

export async function searchYandex(query) {
  const params = encodeQueryParams({
    text: query, nocorrect: 'False', type: 'track', page: 0,
    'playlist-in-best': 'True',
  });
  const result = await getResult('/search?' + params);
  return parseSearchResult(result).slice(0, 5).map(normalizeYandex).filter(Boolean);
}

// Fetch only unencrypted MP3 when the account/API explicitly exposes one.
// Links are short-lived and must be resolved at download time.
export async function getYandexRawMp3(trackId) {
  if (!YANDEX_OAUTH_TOKEN) throw new Error('YANDEX_TOKEN_MISSING');
  if (!validTrackId(trackId)) throw new Error('YANDEX_TRACK_INVALID');
  for (const quality of ['hq', 'nq']) {
    const timestamp = Math.floor(Date.now() / 1000);
    const codecs = ['mp3'], transport = 'raw';
    const params = encodeQueryParams({
      ts: timestamp, trackId, quality, codecs: codecs.join(','),
      transports: transport,
      sign: yandexFileInfoSignature(trackId, quality, codecs, transport, timestamp),
    });
    const value = await getResult('/get-file-info?' + params, 'desktop');
    const info = value?.downloadInfo;
    if (!info) continue;
    if (info.transport !== 'raw' || info.codec !== 'mp3') continue;
    const candidates = [info.url, ...(Array.isArray(info.urls) ? info.urls : [])];
    const url = candidates.find(isYandexAudioUrl);
    if (!url) throw new Error('YANDEX_UNTRUSTED_AUDIO_URL');
    return {
      url, bitrate: Number(info.bitrate) || null,
      size: Number(info.size) || null, quality,
    };
  }
  throw new Error('YANDEX_RAW_MP3_UNAVAILABLE');
}

async function checkOne(name, fn) {
  try {
    const value = await fn();
    return name + ': ✅ ' + value;
  } catch (error) {
    const code = safeYandexErrorCode(error);
    console.warn('Yandex diagnostic', name, code);
    return name + ': ❌ ' + code;
  }
}

// Probes only; never return personal data, OAuth credentials, URLs, headers,
// response bodies or Yandex account details to the Telegram chat.
export async function diagnoseYandex() {
  if (!YANDEX_OAUTH_TOKEN) return ['OAuth: ⚠️ токен отсутствует'];
  const [account, track, search, audio] = await Promise.all([
    checkOne('Авторизация', async () => {
      const value = await getResult('/account/status');
      if (!value || typeof value !== 'object') throw new Error('YANDEX_RESULT_MISSING');
      return 'API ответил';
    }),
    checkOne('Трек 126278860', async () => {
      const result = parseTrackResult(await getResult('/tracks/126278860'));
      return result.length ? 'данные получены' : 'ответ пустой';
    }),
    checkOne('Поиск «Монеточка»', async () => {
      const query = encodeQueryParams({
        text: 'Монеточка', nocorrect: 'False', type: 'track',
        page: 0, 'playlist-in-best': 'True',
      });
      const result = parseSearchResult(await getResult('/search?' + query));
      return result.length + ' результатов';
    }),
    checkOne('MP3 raw (126278860)', async () => {
      const info = await getYandexRawMp3('126278860');
      return 'доступен ' + info.quality + (info.bitrate ? ' · ' + info.bitrate + ' кбит/с' : '');
    }),
  ]);
  return [account, track, search, audio];
}

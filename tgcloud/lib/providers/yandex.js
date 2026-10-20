import { fetch } from 'sdk';
import { YANDEX_OAUTH_TOKEN } from '../runtime-secrets.js';
import { yandexFileInfoSignature } from '../crypto-hmac.js';
import { encodeQueryParams, isYandexAudioUrl, validTrackId } from '../pure.js';
import { normalizeYandex } from './normalize.js';
import {
  yandexHeaders, yandexTrackLookup, yandexHttpError, unwrapYandexEnvelope,
  parseTrackResult, parseSearchResult, safeYandexErrorCode,
} from './yandex-protocol.js';

const API = 'https://api.music.yandex.net';

// Never print response bodies, authorization headers or expiring CDN URLs.
async function getResult(path, profile = 'android', request = {}) {
  const method = request.method || 'GET';
  const headers = yandexHeaders(YANDEX_OAUTH_TOKEN, profile);
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

  let response;
  try {
    response = await fetch(API + path, {
      method, headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
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
  // The presence of a token does not prove validity or subscription rights.
  return Boolean(YANDEX_OAUTH_TOKEN);
}

export async function getYandexTrack(id) {
  if (!validTrackId(id)) return null;
  const request = yandexTrackLookup(id);
  const result = await getResult(request.path, 'android', request);
  const tracks = parseTrackResult(result);
  return normalizeYandex(tracks[0]);
}

export async function searchYandex(query) {
  const params = encodeQueryParams({
    text: query, nocorrect: 'False', type: 'track', page: 0,
    'playlist-in-best': 'True',
  });
  const result = await getResult('/search?' + params);
  return parseSearchResult(result).slice(0, 8).map(normalizeYandex).filter(Boolean);
}

// Access only an unencrypted MP3 the authenticated API actually permits.
// Do not retry a forbidden request using alternate clients or decrypt encraw.
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
    return name + ': ✅ ' + await fn();
  } catch (error) {
    const code = safeYandexErrorCode(error);
    console.warn('Yandex diagnostic', name, code);
    return name + ': ❌ ' + code;
  }
}

// Safe-to-share outputs: never include user ID, access tokens, URLs or payloads.
// Each check is independent; a forbidden file request cannot hide a good search.
export async function diagnoseYandex() {
  if (!YANDEX_OAUTH_TOKEN) return ['OAuth: ⚠️ токен отсутствует'];
  return Promise.all([
    checkOne('Авторизация', async () => {
      const status = await getResult('/account/status');
      if (!status || typeof status !== 'object') throw new Error('YANDEX_RESULT_MISSING');
      return 'API ответил (права на скачивание не проверены)';
    }),
    checkOne('Трек 126278860', async () => {
      const req = yandexTrackLookup('126278860');
      const tracks = parseTrackResult(await getResult(req.path, 'android', req));
      return tracks.length ? 'данные получены' : 'трек не найден';
    }),
    checkOne('Поиск «Монеточка»', async () => {
      const query = encodeQueryParams({
        text: 'Монеточка', nocorrect: 'False', type: 'track',
        page: 0, 'playlist-in-best': 'True',
      });
      const tracks = parseSearchResult(await getResult('/search?' + query));
      return tracks.length + ' результатов';
    }),
    checkOne('MP3 raw (126278860)', async () => {
      const info = await getYandexRawMp3('126278860');
      return 'доступен ' + info.quality +
        (info.bitrate ? ' · ' + info.bitrate + ' кбит/с' : '');
    }),
  ]);
}

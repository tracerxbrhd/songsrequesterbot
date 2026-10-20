// Pure Yandex Music protocol helpers. No credentials in this file.
export const YANDEX_ANDROID_CLIENT = 'YandexMusicAndroid/24023621';
export const YANDEX_DESKTOP_CLIENT = 'YandexMusicDesktopAppWindows/5.95.0';

export function yandexHeaders(token, profile = 'android') {
  const headers = {
    Accept: 'application/json',
    'X-Yandex-Music-Client':
      profile === 'desktop' ? YANDEX_DESKTOP_CLIENT : YANDEX_ANDROID_CLIENT,
  };
  if (token) headers.Authorization = 'OAuth ' + token;
  return headers;
}

export function yandexTrackLookup(trackId) {
  const id = String(trackId ?? '');
  if (!/^[1-9]\d{0,15}$/.test(id)) throw new Error('YANDEX_TRACK_INVALID');
  // MarshalX/yandex-music-api _BatchMixin._get_list('track') calls:
  // POST https://api.music.yandex.net/tracks with form field "track-ids".
  // GET /tracks/{id} is *not* the track metadata lookup endpoint.
  return {
    path: '/tracks',
    method: 'POST',
    body: 'with-positions=True&track-ids=' + encodeURIComponent(id),
  };
}

export function yandexHttpError(status) {
  switch (status) {
    case 400: return 'YANDEX_HTTP_400';
    case 401: return 'YANDEX_HTTP_401';
    case 403: return 'YANDEX_HTTP_403';
    case 404: return 'YANDEX_HTTP_404';
    case 408: return 'YANDEX_HTTP_408';
    case 422: return 'YANDEX_HTTP_422';
    case 429: return 'YANDEX_HTTP_429';
    default:
      if (Number.isInteger(status) && status >= 400 && status < 500) return 'YANDEX_HTTP_4XX';
      if (Number.isInteger(status) && status >= 500 && status < 600) return 'YANDEX_HTTP_5XX';
      return 'YANDEX_HTTP_UNKNOWN';
  }
}

export function unwrapYandexEnvelope(envelope, profile = 'android') {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('YANDEX_JSON_INVALID');
  }
  if (envelope.error) throw new Error('YANDEX_API_ERROR');
  if (Object.prototype.hasOwnProperty.call(envelope, 'result')) return envelope.result;
  if (profile === 'desktop' &&
      Object.prototype.hasOwnProperty.call(envelope, 'downloadInfo')) {
    return envelope;
  }
  throw new Error('YANDEX_RESULT_MISSING');
}

export function parseTrackResult(result) {
  if (result === null) return [];
  if (!Array.isArray(result)) throw new Error('YANDEX_TRACK_SCHEMA');
  return result;
}

export function parseSearchResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('YANDEX_SEARCH_SCHEMA');
  }
  const tracks = result.tracks;
  if (tracks != null && (!tracks || !Array.isArray(tracks.results))) {
    throw new Error('YANDEX_SEARCH_SCHEMA');
  }
  const items = Array.isArray(tracks?.results) ? tracks.results : [];
  const best = result.best;
  if (best?.type === 'track' && best.result?.id != null) {
    const id = String(best.result.id);
    if (!items.some((item) => String(item?.id) === id)) {
      return [best.result, ...items];
    }
  }
  return items;
}

export function safeYandexErrorCode(error) {
  // A fixed code vocabulary: do not copy raw HTTP bodies, OAuth or URLs.
  const code = String(error?.message || '');
  return /^YANDEX_[A-Z0-9_]{3,40}$/.test(code) ? code : 'YANDEX_UNEXPECTED';
}

export function publicYandexError(error) {
  const code = safeYandexErrorCode(error);
  const messages = {
    YANDEX_TOKEN_MISSING: '🔑 OAuth-токен Яндекса не настроен.',
    YANDEX_HTTP_400: '⚠️ Яндекс отклонил параметры запроса (HTTP 400).',
    YANDEX_HTTP_401: '🔑 Яндекс отклонил OAuth (HTTP 401). Проверь токен.',
    YANDEX_HTTP_403: '⛔ Яндекс запретил запрос (HTTP 403). Доступ к этой операции не предоставлен.',
    YANDEX_HTTP_404: '🔎 Яндекс не нашёл ресурс (HTTP 404).',
    YANDEX_HTTP_408: '⏳ Яндекс не успел ответить (HTTP 408).',
    YANDEX_HTTP_422: '⚠️ Яндекс не принял формат данных (HTTP 422).',
    YANDEX_HTTP_429: '⏳ Яндекс ограничил частоту запросов (HTTP 429).',
    YANDEX_HTTP_4XX: '⚠️ Яндекс отклонил запрос (HTTP 4xx).',
    YANDEX_HTTP_5XX: '⚠️ Внутренняя ошибка сервера Яндекса (HTTP 5xx).',
    YANDEX_HTTP_UNKNOWN: '⚠️ Не удалось определить HTTP-ответ API Яндекса.',
    YANDEX_NETWORK: '🌐 Нет соединения Telegram Cloud с API Яндекса.',
    YANDEX_JSON_INVALID: '⚠️ Яндекс вернул некорректный JSON.',
    YANDEX_API_ERROR: '⚠️ Яндекс вернул ошибку API.',
    YANDEX_RESULT_MISSING: '⚠️ Яндекс изменил формат ответа API.',
    YANDEX_TRACK_SCHEMA: '⚠️ Неожиданный формат данных о треке.',
    YANDEX_SEARCH_SCHEMA: '⚠️ Неожиданный формат поисковой выдачи.',
    YANDEX_RAW_MP3_UNAVAILABLE: '🔒 Яндекс не предоставил обычный MP3 для этого трека.',
    YANDEX_UNTRUSTED_AUDIO_URL: '🛡️ Яндекс вернул неизвестный адрес аудио. Загрузка остановлена.',
  };
  return messages[code] || '⚠️ Ошибка при обращении к Яндекс Музыке (' + code + ').';
}

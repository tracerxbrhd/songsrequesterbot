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
    form: { 'with-positions': 'True', 'track-ids': id },
  };
}

// Preserve the *exact* upstream 400-599 code, never the response body.
// The former broad "4XX" category hid 405/451 and made API debugging blind.
export function yandexHttpError(status) {
  const value = typeof status === 'number' ? status : Number(status);
  return Number.isInteger(value) && value >= 400 && value <= 599
    ? 'YANDEX_HTTP_' + value
    : 'YANDEX_HTTP_UNKNOWN';
}

// Only a populated account.uid confirms OAuth resolves to a Yandex account.
// A 200 response from /account/status by itself is not sufficient evidence.
export function confirmedYandexAccount(status) {
  const uid = status?.account?.uid;
  if (typeof uid === 'number') return Number.isSafeInteger(uid) && uid > 0;
  return typeof uid === 'string' && /^[1-9]\d{0,19}$/.test(uid);
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
  const match = /^YANDEX_HTTP_([45]\d{2})$/.exec(code);
  if (match) {
    if (match[1] === '405') {
      return '⚠️ HTTP 405: API Яндекса отклонил HTTP-метод запроса.';
    }
    if (match[1] === '451') {
      return '⚠️ HTTP 451: контент может быть недоступен по региональным или правовым ограничениям.';
    }
    if (match[1][0] === '5') {
      return '⚠️ Яндекс вернул серверную ошибку HTTP ' + match[1] + '.';
    }
    return '⚠️ Яндекс отклонил запрос (HTTP ' + match[1] + ').';
  }
  if (code === 'YANDEX_ACCOUNT_UNVERIFIED') {
    return '🔑 API ответил, но не подтвердил действующую учётную запись Яндекса.';
  }
  return messages[code] || '⚠️ Ошибка при обращении к Яндекс Музыке (' + code + ').';
}

// Pure contract helpers for the unofficial Yandex Music API.
// Derived from the client profiles used in yandex-music-api (MarshalX).
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

export function yandexHttpError(status) {
  if (status === 401) return 'YANDEX_HTTP_401';
  if (status === 403) return 'YANDEX_HTTP_403';
  if (status === 404) return 'YANDEX_HTTP_404';
  if (status === 429) return 'YANDEX_HTTP_429';
  if (status >= 500 && status <= 599) return 'YANDEX_HTTP_5XX';
  return 'YANDEX_HTTP_OTHER';
}

export function unwrapYandexEnvelope(envelope, profile = 'android') {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('YANDEX_JSON_INVALID');
  }
  if (envelope.error) throw new Error('YANDEX_API_ERROR');
  if (Object.prototype.hasOwnProperty.call(envelope, 'result')) {
    return envelope.result;
  }
  if (profile === 'desktop' &&
      Object.prototype.hasOwnProperty.call(envelope, 'downloadInfo')) {
    return envelope;
  }
  throw new Error('YANDEX_RESULT_MISSING');
}

export function parseTrackResult(result) {
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

export function publicYandexError(error) {
  // Never display arbitrary exception strings or upstream JSON; only fixed codes.
  const code = String(error?.message || '');
  if (code === 'YANDEX_TOKEN_MISSING') return '🔑 OAuth-токен Яндекса не настроен.';
  if (code === 'YANDEX_HTTP_401') return '🔑 Яндекс отклонил OAuth: HTTP 401. Проверь токен.';
  if (code === 'YANDEX_HTTP_403') return '⛔ Яндекс запретил запрос: HTTP 403. Возможны ограничения аккаунта, региона или API.';
  if (code === 'YANDEX_HTTP_404') return '🔎 Яндекс не нашёл запрошенный ресурс: HTTP 404.';
  if (code === 'YANDEX_HTTP_429') return '⏳ Слишком много запросов к Яндексу: HTTP 429.';
  if (code === 'YANDEX_HTTP_5XX') return '⚠️ Ошибка сервера Яндекса (HTTP 5xx).';
  if (code === 'YANDEX_HTTP_OTHER') return '⚠️ Яндекс отклонил запрос (нестандартный HTTP-код).';
  if (code === 'YANDEX_NETWORK') return '🌐 Telegram Cloud не смог подключиться к API Яндекса.';
  if (code === 'YANDEX_JSON_INVALID') return '⚠️ Яндекс вернул ответ, который не удалось прочитать как JSON.';
  if (code === 'YANDEX_API_ERROR') return '⚠️ Яндекс вернул ошибку API.';
  if (code === 'YANDEX_RESULT_MISSING' || code === 'YANDEX_TRACK_SCHEMA' ||
      code === 'YANDEX_SEARCH_SCHEMA') {
    return '⚠️ Изменилась структура ответа API Яндекса.';
  }
  if (code === 'YANDEX_RAW_MP3_UNAVAILABLE') return
    '🔒 API Яндекса не предоставил обычный MP3 для этой композиции.';
  if (code === 'YANDEX_UNTRUSTED_AUDIO_URL') return
    '🛡️ API вернул неизвестный адрес аудио. Загрузка остановлена.';
  return '⚠️ Неожиданная ошибка обработки запроса (код: OTHER).';
}

export function safeYandexErrorCode(error) {
  const value = String(error?.message || '');
  return /^YANDEX_[A-Z0-9_]{3,40}$/.test(value) ? value : 'YANDEX_UNEXPECTED';
}

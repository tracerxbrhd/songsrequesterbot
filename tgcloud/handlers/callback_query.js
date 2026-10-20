import { api } from 'sdk';
import { parseAction } from '../lib/pure.js';
import { getTrack } from '../lib/providers/registry.js';
import { deliverAudio } from '../lib/delivery.js';
import {
  publicYandexError, safeYandexErrorCode,
} from '../lib/providers/yandex-protocol.js';
import {
  welcomeText, helpText, homeKeyboard, backKeyboard,
  displayText, showTrack, sendText,
} from '../lib/ui.js';

function downloadErrorMessage(error) {
  const code = String(error?.message || '');
  if (code === 'YANDEX_RAW_MP3_UNAVAILABLE' || code === 'YANDEX_TOKEN_MISSING' ||
      code === 'YANDEX_HTTP_401' || code === 'YANDEX_HTTP_403' ||
      code === 'YANDEX_HTTP_429' || code === 'YANDEX_NETWORK' ||
      code === 'YANDEX_JSON_INVALID' || code === 'YANDEX_UNTRUSTED_AUDIO_URL' ||
      code === 'YANDEX_API_ERROR' || code === 'YANDEX_RESULT_MISSING') {
    return publicYandexError(error);
  }
  if (code === 'AUDIO_TOO_LARGE') return '⚠️ Файл превышает ограничения Telegram Cloud.';
  if (code === 'AUDIO_TELEGRAM_URL_REJECTED') {
    return '⚠️ Telegram не смог забрать MP3 по временной ссылке. ' +
      'Для этого источника может потребоваться внешний обработчик аудио.';
  }
  if (code === 'AUDIO_URL_NOT_TRUSTED') {
    return '🛡️ Неизвестный адрес аудиофайла, загрузка остановлена.';
  }
  return '⚠️ Не удалось передать MP3 в Telegram. /diagnose покажет состояние API.';
}

export default async function (query) {
  if (!query?.from || query.from.is_bot || query.message?.chat?.type !== 'private') return;
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  try { await api.answerCallbackQuery({ callback_query_id: query.id }); }
  catch (_) { /* Expired callback. */ }
  if (!Number.isSafeInteger(userId)) return;

  const action = parseAction(query.data);
  if (action.kind === 'home') return displayText(chatId, welcomeText, homeKeyboard, query.message);
  if (action.kind === 'help') return displayText(chatId, helpText, backKeyboard, query.message);
  if (action.kind === 'invalid') return sendText(chatId, 'Эта кнопка устарела. Отправь /start.');

  try {
    const track = await getTrack(action.source, action.id);
    if (!track) return sendText(chatId, '🔎 Трек больше не найден.');
    if (action.kind === 'track') return showTrack(chatId, track, query.message);
    if (action.kind === 'download') {
      if (track.source === 'j' && !track.downloadAllowed) {
        return sendText(chatId, '🔒 Правообладатель не разрешил загрузить этот трек.');
      }
      const result = await deliverAudio(chatId, track);
      if (result.status === 'forbidden') return sendText(chatId, '🔒 Загрузка недоступна.');
    }
  } catch (error) {
    console.warn('Music callback failed', safeYandexErrorCode(error));
    return sendText(chatId, downloadErrorMessage(error));
  }
}

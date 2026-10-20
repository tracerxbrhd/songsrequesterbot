import { api } from 'sdk';
import { parseAction } from '../lib/pure.js';
import { getYandexTrack } from '../lib/providers/yandex.js';
import { deliverAudio } from '../lib/delivery.js';
import { publicYandexError, safeYandexErrorCode } from '../lib/providers/yandex-protocol.js';
import {
  welcomeText, helpText, homeKeyboard, backKeyboard,
  displayText, showTrack, sendText,
} from '../lib/ui.js';

function downloadErrorMessage(error) {
  const code = String(error?.message || '');
  if (code === 'AUDIO_TOO_LARGE') return '⚠️ MP3 превышает ограничения отправки.';
  if (code === 'AUDIO_TELEGRAM_URL_REJECTED') {
    return '⚠️ Telegram не смог получить MP3 по временной ссылке Яндекса.';
  }
  if (code === 'AUDIO_URL_NOT_TRUSTED') return '🛡️ Источник аудио не прошёл проверку.';
  if (code.startsWith('YANDEX_')) return publicYandexError(error);
  return '⚠️ Ошибка отправки аудио. Попробуй позже.';
}

export default async function (query) {
  if (!query?.from || query.from.is_bot || query.message?.chat?.type !== 'private') return;
  const chatId = query.message.chat.id;
  try { await api.answerCallbackQuery({ callback_query_id: query.id }); }
  catch (_) { /* Callback may have expired. */ }

  const action = parseAction(query.data);
  if (action.kind === 'home') return displayText(chatId, welcomeText, homeKeyboard, query.message);
  if (action.kind === 'help') return displayText(chatId, helpText, backKeyboard, query.message);
  if (action.kind === 'invalid') return sendText(chatId, 'Кнопка устарела. Открой /start.');

  try {
    const track = await getYandexTrack(action.id);
    if (!track) return sendText(chatId, '🔎 Композиция недоступна.');
    if (action.kind === 'track') return showTrack(chatId, track, query.message);
    if (action.kind === 'download') {
      const result = await deliverAudio(chatId, track);
      if (result.status === 'forbidden') return sendText(chatId, '🔒 Загрузка недоступна.');
    }
  } catch (error) {
    console.warn('Music callback failed', safeYandexErrorCode(error));
    return sendText(chatId, downloadErrorMessage(error));
  }
}

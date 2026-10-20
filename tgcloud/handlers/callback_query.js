import { api } from 'sdk';
import { parseAction } from '../lib/pure.js';
import { getTrack } from '../lib/providers/registry.js';
import { deliverAudio } from '../lib/delivery.js';
import { welcomeText, helpText, homeKeyboard, backKeyboard, displayText, showTrack, sendText } from '../lib/ui.js';

function downloadErrorMessage(code) {
  if (code === 'YANDEX_TOKEN_MISSING') {
    return '🔑 Добавь YANDEX_OAUTH_TOKEN в GitHub Actions Secrets и перезапусти деплой.';
  }
  if (code === 'YANDEX_AUTH_FAILED') {
    return '🔑 OAuth-токен Яндекса недействителен, истёк или у аккаунта нет доступа.';
  }
  if (code === 'YANDEX_RAW_MP3_UNAVAILABLE') {
    return '🔒 Яндекс не предоставил для этого трека обычный MP3. Защищённые потоки бот не расшифровывает.';
  }
  if (code === 'YANDEX_UNTRUSTED_AUDIO_URL' || code === 'AUDIO_URL_NOT_TRUSTED') {
    return '🛡️ Источник вернул неизвестный адрес аудио, загрузка остановлена.';
  }
  if (code === 'AUDIO_TOO_LARGE') {
    return '⚠️ Файл превышает ограничения Telegram Cloud.';
  }
  return '⚠️ Не получилось скачать трек. Попробуй другую композицию или повтори позже.';
}

export default async function (query) {
  if (!query?.from || query.from.is_bot || query.message?.chat?.type !== 'private') return;
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  try { await api.answerCallbackQuery({ callback_query_id: query.id }); }
  catch (_) { /* Callback may have expired. */ }
  if (!Number.isSafeInteger(userId)) return;

  // Buttons are not rate-limited: a personal bot must allow immediate
  // navigation and download right after opening a track.
  const action = parseAction(query.data);
  if (action.kind === 'home') return displayText(chatId, welcomeText, homeKeyboard, query.message);
  if (action.kind === 'help') return displayText(chatId, helpText, backKeyboard, query.message);
  if (action.kind === 'invalid') return sendText(chatId, 'Эта кнопка устарела. Отправь /start.');

  try {
    const track = await getTrack(action.source, action.id);
    if (!track) return sendText(chatId, 'Трек больше не найден.');
    if (action.kind === 'track') return showTrack(chatId, track, query.message);
    if (action.kind === 'download') {
      if (track.source === 'j' && !track.downloadAllowed) {
        return sendText(chatId, '🔒 Правообладатель не разрешил загрузить этот трек через API.');
      }
      const result = await deliverAudio(chatId, track);
      if (result.status === 'forbidden') return sendText(chatId, '🔒 Загрузка недоступна.');
    }
  } catch (error) {
    const code = String(error?.message || error).slice(0, 100);
    console.warn('Music callback failed', code);
    return sendText(chatId, downloadErrorMessage(code));
  }
}

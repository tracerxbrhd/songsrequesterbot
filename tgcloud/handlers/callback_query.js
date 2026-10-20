import { api } from 'sdk';
import { OWNER_TELEGRAM_ID, PUBLIC_MODE } from '../lib/config.js';
import { parseAction } from '../lib/pure.js';
import { getTrack } from '../lib/providers/registry.js';
import { deliverAudio } from '../lib/delivery.js';
import { welcomeText, helpText, homeKeyboard, backKeyboard, displayText, showTrack, sendText } from '../lib/ui.js';
import { throttle } from '../lib/storage.js';

export default async function (query) {
  if (!query?.from || query.from.is_bot || query.message?.chat?.type !== 'private') return;
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  try { await api.answerCallbackQuery({ callback_query_id: query.id }); }
  catch (_) { /* Callback may have expired. */ }

  if (!Number.isSafeInteger(userId) ||
      !((OWNER_TELEGRAM_ID > 0 && OWNER_TELEGRAM_ID === userId) || PUBLIC_MODE)) {
    return sendText(chatId, '🔐 Доступ закрыт.');
  }

  const action = parseAction(query.data);
  if (action.kind === 'home') return displayText(chatId, welcomeText, homeKeyboard, query.message);
  if (action.kind === 'help') return displayText(chatId, helpText, backKeyboard, query.message);
  if (action.kind === 'invalid') return sendText(chatId, 'Эта кнопка устарела. Отправь /start.');
  if (!(await throttle(userId))) return sendText(chatId, '⏳ Повтори действие через несколько секунд.');

  try {
    const track = await getTrack(action.source, action.id);
    if (!track) return sendText(chatId, 'Трек больше не найден.');
    if (action.kind === 'track') return showTrack(chatId, track, query.message);
    if (action.kind === 'download') {
      if (!track.downloadAllowed) return sendText(chatId,
        '🔒 Правообладатель не разрешил скачать этот трек через API.');
      const result = await deliverAudio(chatId, track);
      if (result.status === 'forbidden') return sendText(chatId, '🔒 Загрузка этого трека недоступна.');
      return;
    }
  } catch (e) {
    const code = String(e?.message || e).slice(0, 160);
    console.warn('Music callback failed', code);
    if (code === 'AUDIO_TOO_LARGE') {
      return sendText(chatId, '⚠️ Аудиофайл слишком большой для загрузки через serverless.');
    }
    return sendText(chatId, '⚠️ Не получилось обработать трек. Попробуй позже.');
  }
}

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { OWNER_TELEGRAM_ID, PUBLIC_MODE } from '../lib/config.js';
import { parseRequest } from '../lib/pure.js';
import { getTrack, findTracks } from '../lib/providers/registry.js';
import { throttle } from '../lib/storage.js';
import { welcomeText, helpText, homeKeyboard, backKeyboard, sendText, showTrack, showResults } from '../lib/ui.js';

function allowed(id) {
  return Number.isSafeInteger(id) &&
    ((OWNER_TELEGRAM_ID > 0 && id === OWNER_TELEGRAM_ID) || PUBLIC_MODE);
}

async function handleLookup(chatId, request) {
  if (request.kind === 'track') {
    const track = await getTrack(request.source, request.id);
    return track ? showTrack(chatId, track) :
      sendText(chatId, 'Не удалось найти композицию. Попробуй другую ссылку.');
  }
  if (request.kind === 'search') {
    const tracks = await findTracks(request.query);
    return showResults(chatId, request.query, tracks);
  }
  return sendText(chatId,
    request.kind === 'unsupported'
      ? '⚠️ Пока принимаются ссылки на отдельные треки Яндекс Музыки и Jamendo.'
      : '✍️ Пришли ссылку на трек либо название длиной от 2 до 120 символов.');
}

export default async function (message) {
  if (!message?.from || message.from.is_bot || message.chat?.type !== 'private') return;
  const id = message.from.id;
  const chatId = message.chat.id;
  if (!Number.isSafeInteger(id)) return;
  const input = typeof message.text === 'string' ? message.text.trim() : '';
  const command = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(input);
  const name = command?.[1]?.toLowerCase();
  const argument = command?.[2]?.trim() || '';

  if (name === 'id' || name === 'whoami') {
    return sendText(chatId, '🆔 Твой Telegram ID: <code>' + id + '</code>');
  }

  if (!allowed(id)) {
    const info = OWNER_TELEGRAM_ID ? '🔐 Это личный бот. Доступ закрыт.' :
      '🔧 Владелец ещё не настроен. Отправь /id и укажи полученный номер в tgcloud/lib/config.js.';
    return sendText(chatId, info, null);
  }

  if (name === 'start' || name === 'menu') return sendText(chatId, welcomeText, homeKeyboard);
  if (name === 'help') return sendText(chatId, helpText, backKeyboard);
  if (name === 'privacy') return sendText(chatId,
    '🔐 <b>Приватность</b>\n\nБот хранит Telegram ID, время запросов и общий кеш file_id. ' +
    'История поисковых запросов не сохраняется.\n\n' +
    '/delete — удалить свой пользовательский идентификатор из базы.', backKeyboard);
  if (name === 'delete') {
    await db.delete(users).where(eq(users.tgId, id)).run();
    return sendText(chatId, '✅ Твой пользовательский профиль удалён. Общий кеш аудиофайлов сохранён.');
  }
  if (name && name !== 'search') return sendText(chatId, 'Неизвестная команда. Напиши /help.');
  if (name === 'search' && !argument) return sendText(chatId, 'Напиши: /search Исполнитель — Название');
  if (!input && !name) return;

  const request = parseRequest(name === 'search' ? argument : input);
  if (request.kind === 'invalid' || request.kind === 'unsupported') return handleLookup(chatId, request);
  if (!(await throttle(id))) return sendText(chatId, '⏳ Слишком быстро. Повтори запрос через несколько секунд.');
  try {
    return await handleLookup(chatId, request);
  } catch (e) {
    console.warn('Music request failed', String(e?.message || e).slice(0, 160));
    return sendText(chatId,
      '⚠️ Музыкальный сервис сейчас не ответил. Попробуй позже или пришли прямую ссылку на трек.');
  }
}

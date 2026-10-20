import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { parseRequest } from '../lib/pure.js';
import { hasYandexOAuth, diagnoseYandex, getYandexTrack, searchYandex } from '../lib/providers/yandex.js';
import { publicYandexError, safeYandexErrorCode } from '../lib/providers/yandex-protocol.js';
import { throttle } from '../lib/storage.js';
import {
  welcomeText, helpText, homeKeyboard, backKeyboard,
  sendText, showTrack, showResults,
} from '../lib/ui.js';

async function handleLookup(chatId, request) {
  if (request.kind === 'track') {
    const track = await getYandexTrack(request.id);
    return track ? showTrack(chatId, track) :
      sendText(chatId, '🔎 Композиция не найдена в Яндекс Музыке.');
  }
  if (request.kind === 'search') {
    return showResults(chatId, request.query, await searchYandex(request.query));
  }
  return sendText(chatId, request.kind === 'unsupported'
    ? '⚠️ Принимаются только ссылки на отдельные треки Яндекс Музыки.'
    : '✍️ Пришли ссылку на трек или название длиной 2–120 символов.');
}

export default async function (message) {
  if (!message?.from || message.from.is_bot || message.chat?.type !== 'private') return;
  const id = message.from.id;
  const chatId = message.chat.id;
  if (!Number.isSafeInteger(id)) return;
  // Access is explicitly limited to the owner in BotFather.
  const input = typeof message.text === 'string' ? message.text.trim() : '';
  const command = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(input);
  const name = command?.[1]?.toLowerCase();
  const argument = command?.[2]?.trim() || '';

  if (name === 'id' || name === 'whoami') {
    return sendText(chatId, '🆔 Твой Telegram ID: <code>' + id + '</code>');
  }
  if (name === 'start' || name === 'menu') return sendText(chatId, welcomeText, homeKeyboard);
  if (name === 'help') return sendText(chatId, helpText, backKeyboard);
  if (name === 'status') return sendText(chatId,
    '<b>⚙️ Яндекс Музыка</b>\n\n' +
    'OAuth: ' + (hasYandexOAuth() ? '🔑 токен загружен (права не проверены)' : '⚠️ не настроен') +
    '\n\n/diagnose — проверить живые запросы API.', backKeyboard);
  if (name === 'diagnose') {
    const results = await diagnoseYandex();
    return sendText(chatId,
      '<b>🩺 Диагностика Яндекс Музыки</b>\n\n' + results.join('\n') +
      '\n\n🔐 Выводятся только статусы, без токена и данных аккаунта.', backKeyboard);
  }
  if (name === 'privacy') return sendText(chatId,
    '🔐 <b>Приватность</b>\n\nБот сохраняет Telegram ID, время последнего запроса и кеш file_id. ' +
    'Поисковую историю не записывает.\n\n/delete — удалить пользовательскую запись.', backKeyboard);
  if (name === 'delete') {
    await db.delete(users).where(eq(users.tgId, id)).run();
    return sendText(chatId, '✅ Данные пользователя удалены. Общий кеш MP3 не затронут.');
  }
  if (name && name !== 'search') return sendText(chatId, 'Неизвестная команда. Используй /help.');
  if (name === 'search' && !argument) return sendText(chatId, 'Формат: /search Исполнитель — Название');
  if (!input && !name) return;

  const request = parseRequest(name === 'search' ? argument : input);
  if (request.kind === 'invalid' || request.kind === 'unsupported') return handleLookup(chatId, request);
  if (!(await throttle(id))) return sendText(chatId, '⏳ Подожди секунду и повтори запрос.');
  try {
    return await handleLookup(chatId, request);
  } catch (error) {
    console.warn('Music request failed', safeYandexErrorCode(error));
    return sendText(chatId, publicYandexError(error) +
      '\n\n/diagnose — проверить ответы API.');
  }
}

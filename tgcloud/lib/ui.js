import { api } from 'sdk';
import { displayDuration, escapeHtml, trimLabel } from './pure.js';

export const homeKeyboard = {
  inline_keyboard: [[{ text: '🎵 Как пользоваться', callback_data: 'nav:help' }]],
};
export const backKeyboard = {
  inline_keyboard: [[{ text: '🏠 В начало', callback_data: 'nav:home' }]],
};

export const welcomeText =
  '<b>🎵 Songs Requester · Яндекс Музыка</b>\n\n' +
  'Отправь ссылку на отдельный трек Яндекс Музыки или напиши исполнителя и название.\n\n' +
  'Бот найдёт композицию и попробует отправить MP3, если Яндекс предоставит доступ к незашифрованному файлу.\n\n' +
  'Команды: /help · /status · /diagnose';

export const helpText =
  '<b>🎧 Как пользоваться</b>\n\n' +
  '1. Пришли ссылку music.yandex.ru/album/123/track/456.\n' +
  '2. Или напиши «Исполнитель — Название».\n' +
  '3. Выбери трек и нажми «⬇️ Скачать MP3».\n\n' +
  '⚠️ Наличие подписки и OAuth не гарантирует передачу файла: ' +
  'Яндекс может ограничивать выдачу аудио. Зашифрованные потоки не обрабатываются.\n\n' +
  '/status — проверить наличие OAuth\n' +
  '/diagnose — запросы к API\n' +
  '/start — в начало';

export async function sendText(chatId, html, keyboard = backKeyboard) {
  return api.sendMessage({
    chat_id: chatId, text: html, parse_mode: 'HTML',
    reply_markup: keyboard, link_preview_options: { is_disabled: true },
  });
}

export async function displayText(chatId, html, keyboard, message) {
  if (message?.message_id && message.chat?.id === chatId && !message.photo) {
    try {
      return await api.editMessageText({
        chat_id: chatId, message_id: message.message_id, text: html,
        parse_mode: 'HTML', reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (_) { /* Old message or content unchanged. */ }
  }
  return sendText(chatId, html, keyboard);
}

export async function showTrack(chatId, track, message) {
  const html = '<b>🎵 ' + escapeHtml(track.title) + '</b>\n' +
    '👤 ' + escapeHtml(track.artist) +
    (track.album ? '\n💿 ' + escapeHtml(track.album) : '') +
    '\n⏱ ' + displayDuration(track.duration) +
    '\n📀 Яндекс Музыка\n\n' +
    '🎧 MP3: доступность проверяется при загрузке.';
  return displayText(chatId, html, { inline_keyboard: [
    [{ text: '⬇️ Скачать MP3', callback_data: 'download:' + track.id }],
    [{ text: '🔗 Открыть в Яндекс Музыке', url: track.url }],
    [{ text: '🏠 В начало', callback_data: 'nav:home' }],
  ] }, message);
}

export async function showResults(chatId, query, tracks, message) {
  if (!tracks.length) {
    return displayText(chatId,
      '🔎 По запросу <b>' + escapeHtml(query) + '</b> ничего не найдено.\n' +
      'Попробуй другое название или прямую ссылку.', backKeyboard, message);
  }
  const buttons = tracks.map((track) => [{
    text: trimLabel(track.artist + ' — ' + track.title, 56),
    callback_data: 'track:' + track.id,
  }]);
  buttons.push([{ text: '🏠 В начало', callback_data: 'nav:home' }]);
  return displayText(chatId,
    '<b>🔎 Яндекс Музыка · результаты</b>\n' +
    escapeHtml(query) + '\n\nВыбери композицию:',
    { inline_keyboard: buttons }, message);
}

import { api } from 'sdk';
import { displayDuration, escapeHtml, trimLabel } from './pure.js';

export const homeKeyboard = {
  inline_keyboard: [[{ text: '🎵 Как пользоваться', callback_data: 'nav:help' }]],
};

export const backKeyboard = {
  inline_keyboard: [[{ text: '🏠 В начало', callback_data: 'nav:home' }]],
};

export const welcomeText =
  '<b>🎵 Songs Requester</b>\n\n' +
  'Пришли ссылку на трек Яндекс Музыки или Jamendo либо напиши исполнителя и название.\n\n' +
  'Я найду композицию, покажу карточку и попробую отправить MP3 прямо в Telegram. ' +
  'Для Яндекса потребуется OAuth и доступ к незашифрованному MP3.\n\n' +
  'Команды: /help · /status · /privacy';

export const helpText =
  '<b>🎧 Как пользоваться</b>\n\n' +
  '1. Вставь ссылку вида music.yandex.ru/album/123/track/456.\n' +
  '2. Или отправь «Исполнитель — Название».\n' +
  '3. Выбери трек и нажми «Скачать MP3».\n\n' +
  '<b>Яндекс Музыка</b>: используется твой OAuth-аккаунт. ' +
  'Работают только файлы, которые API отдаёт как обычный MP3 (raw). ' +
  'Зашифрованные потоки не обрабатываются.\n' +
  '<b>Jamendo</b>: MP3 при наличии разрешения автора и Client ID.\n\n' +
  '/status — подключение источников\n/id — Telegram ID\n/start — главная';

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
    } catch (_) { /* Changed/expired buttons: send a fresh card. */ }
  }
  return sendText(chatId, html, keyboard);
}

export async function showTrack(chatId, track, message) {
  const service = track.source === 'j' ? 'Jamendo' : 'Яндекс Музыка';
  const status = track.source === 'y'
    ? '🎧 MP3: проверка доступности при загрузке'
    : track.downloadAllowed ? '✅ Доступен MP3' : '🔒 Правообладатель запретил загрузку';
  const html = '<b>🎵 ' + escapeHtml(track.title) + '</b>\n' +
    '👤 ' + escapeHtml(track.artist) +
    (track.album ? '\n💿 ' + escapeHtml(track.album) : '') +
    '\n⏱ ' + displayDuration(track.duration) +
    '\n📀 ' + service + '\n\n' + status;
  const buttons = [];
  if (track.source === 'y' || (track.source === 'j' && track.downloadAllowed)) {
    buttons.push([{ text: '⬇️ Скачать MP3', callback_data: 'download:' + track.source + ':' + track.id }]);
  }
  buttons.push([{ text: '🔗 Открыть в ' + service, url: track.url }]);
  buttons.push([{ text: '🏠 В начало', callback_data: 'nav:home' }]);
  return displayText(chatId, html, { inline_keyboard: buttons }, message);
}

export async function showResults(chatId, query, tracks, message) {
  if (!tracks.length) {
    return displayText(chatId,
      '🔎 По запросу <b>' + escapeHtml(query) + '</b> ничего не найдено.\n' +
      'Попробуй другое название или прямую ссылку.', backKeyboard, message);
  }
  const buttons = tracks.map((t) => [{
    text: (t.source === 'j' ? '🟢 ' : '🟡 ') + trimLabel(t.artist + ' — ' + t.title, 53),
    callback_data: 'track:' + t.source + ':' + t.id,
  }]);
  buttons.push([{ text: '🏠 В начало', callback_data: 'nav:home' }]);
  return displayText(chatId,
    '<b>🔎 Результаты поиска</b>\n' + escapeHtml(query) +
    '\n\n🟡 Яндекс Музыка · 🟢 Jamendo\nВыбери композицию:',
    { inline_keyboard: buttons }, message);
}

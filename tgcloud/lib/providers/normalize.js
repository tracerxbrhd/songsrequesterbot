import { validTrackId } from '../pure.js';

export function normalizeYandex(value) {
  if (!value || !validTrackId(String(value.id))) return null;
  const id = String(value.id);
  const artists = Array.isArray(value.artists)
    ? value.artists.map((artist) => artist?.name).filter(Boolean) : [];
  const album = Array.isArray(value.albums) ? value.albums[0] : null;
  const cover = value.coverUri && String(value.coverUri).replace('%%', '200x200');
  return {
    source: 'y',
    id,
    title: String(value.title || 'Без названия'),
    artist: artists.join(', ') || 'Неизвестный исполнитель',
    album: String(album?.title || ''),
    duration: Number.isFinite(value.durationMs) ? value.durationMs / 1000 : null,
    cover: cover ? 'https://' + cover.replace(/^https?:\/\//, '') : null,
    url: 'https://music.yandex.ru/track/' + id,
  };
}

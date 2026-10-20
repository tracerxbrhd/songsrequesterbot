import { isJamendoUrl, validTrackId } from '../pure.js';

export function normalizeYandex(value) {
  if (!value || !validTrackId(String(value.id))) return null;
  const id = String(value.id);
  const artists = Array.isArray(value.artists) ? value.artists.map((x) => x?.name).filter(Boolean) : [];
  const album = Array.isArray(value.albums) ? value.albums[0] : null;
  const cover = value.coverUri && String(value.coverUri).replace('%%', '200x200');
  return {
    source: 'y', id,
    title: String(value.title || 'Без названия'),
    artist: artists.join(', ') || 'Неизвестный исполнитель',
    album: String(album?.title || ''),
    duration: Number.isFinite(value.durationMs) ? value.durationMs / 1000 : null,
    cover: cover ? 'https://' + cover.replace(/^https?:\/\//, '') : null,
    url: 'https://music.yandex.ru/track/' + id,
    downloadAllowed: false, downloadUrl: null,
  };
}

export function normalizeJamendo(value) {
  if (!value || !validTrackId(String(value.id))) return null;
  const id = String(value.id);
  const allowed = value.audiodownload_allowed === true && isJamendoUrl(value.audiodownload);
  return {
    source: 'j', id,
    title: String(value.name || 'Без названия'),
    artist: String(value.artist_name || 'Неизвестный исполнитель'),
    album: String(value.album_name || ''),
    duration: Number.isFinite(Number(value.duration)) ? Number(value.duration) : null,
    cover: typeof value.image === 'string' && /^https:\/\//.test(value.image) ? value.image : null,
    url: 'https://www.jamendo.com/track/' + id,
    downloadAllowed: Boolean(allowed),
    downloadUrl: allowed ? value.audiodownload : null,
  };
}

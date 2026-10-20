import { fetch } from 'sdk';
import { normalizeYandex } from './normalize.js';

const API = 'https://api.music.yandex.net';

async function getJson(path) {
  const response = await fetch(API + path, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('YANDEX_HTTP_' + response.status);
  return response.json();
}

export async function getYandexTrack(id) {
  const json = await getJson('/tracks/' + encodeURIComponent(id));
  const items = Array.isArray(json?.result) ? json.result : [];
  return normalizeYandex(items[0]);
}

export async function searchYandex(query) {
  const url = '/search?type=track&page=0&text=' + encodeURIComponent(query);
  const json = await getJson(url);
  const tracks = json?.result?.tracks?.results;
  return (Array.isArray(tracks) ? tracks : []).slice(0, 5)
    .map(normalizeYandex).filter(Boolean);
}

import { getYandexTrack, searchYandex } from './yandex.js';
import { getJamendoTrack, searchJamendo } from './jamendo.js';

export async function getTrack(source, id) {
  if (source === 'y') return getYandexTrack(id);
  if (source === 'j') return getJamendoTrack(id);
  return null;
}

export async function findTracks(query) {
  const [y, j] = await Promise.allSettled([searchYandex(query), searchJamendo(query)]);
  if (y.status === 'rejected') console.warn('Yandex search unavailable', String(y.reason).slice(0, 120));
  if (j.status === 'rejected') console.warn('Jamendo search unavailable', String(j.reason).slice(0, 120));
  if (y.status === 'rejected' && j.status === 'rejected') throw new Error('ALL_PROVIDERS_FAILED');
  return [
    ...(y.status === 'fulfilled' ? y.value : []),
    ...(j.status === 'fulfilled' ? j.value : []),
  ].slice(0, 8);
}

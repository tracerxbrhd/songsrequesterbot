import { getYandexTrack, searchYandex } from './yandex.js';
import { getJamendoTrack, searchJamendo } from './jamendo.js';
import { safeYandexErrorCode } from './yandex-protocol.js';

export async function getTrack(source, id) {
  if (source === 'y') return getYandexTrack(id);
  if (source === 'j') return getJamendoTrack(id);
  return null;
}

export async function findTracks(query) {
  const [y, j] = await Promise.allSettled([searchYandex(query), searchJamendo(query)]);

  // Never turn an API error into a misleading "nothing found" result.
  // Jamendo is optional and, when not configured, returns an empty list.
  if (y.status === 'rejected') {
    console.warn('Yandex search', safeYandexErrorCode(y.reason));
    if (j.status !== 'fulfilled' || !j.value.length) throw y.reason;
  }
  if (j.status === 'rejected') {
    console.warn('Jamendo search unavailable');
    if (y.status === 'rejected') throw y.reason;
  }

  return [
    ...(y.status === 'fulfilled' ? y.value : []),
    ...(j.status === 'fulfilled' ? j.value : []),
  ].slice(0, 8);
}

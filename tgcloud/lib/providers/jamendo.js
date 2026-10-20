import { fetch } from 'sdk';
import { JAMENDO_CLIENT_ID } from '../config.js';
import { encodeQueryParams } from '../pure.js';
import { normalizeJamendo } from './normalize.js';

async function queryJamendo(params) {
  if (!/^[a-zA-Z0-9]{5,80}$/.test(JAMENDO_CLIENT_ID)) {
    throw new Error('JAMENDO_NOT_CONFIGURED');
  }
  const query = encodeQueryParams({
    client_id: JAMENDO_CLIENT_ID,
    format: 'json',
    limit: '5',
    audioformat: 'mp32',
    audiodlformat: 'mp32',
    ...params,
  });
  const response = await fetch('https://api.jamendo.com/v3.0/tracks/?' + query);
  if (!response.ok) throw new Error('JAMENDO_HTTP_' + response.status);
  const json = await response.json();
  if (json?.headers?.status !== 'success') throw new Error('JAMENDO_API_ERROR');
  return Array.isArray(json.results) ? json.results : [];
}

export async function getJamendoTrack(id) {
  const result = await queryJamendo({ id: String(id), limit: '1' });
  return normalizeJamendo(result[0]);
}

export async function searchJamendo(query) {
  if (!JAMENDO_CLIENT_ID) return [];
  return (await queryJamendo({ search: query })).map(normalizeJamendo).filter(Boolean);
}

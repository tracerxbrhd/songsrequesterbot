const YANDEX_HOSTS = new Set(['music.yandex.ru', 'music.yandex.com', 'music.yandex.by']);

// Telegram Cloud's bare V8 runtime does not expose browser URL globals.
// Only HTTPS URLs with valid ASCII host names, no credentials or custom ports.
export function parseHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 ||
      /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i.exec(value);
  if (!match) return null;
  const hostname = match[1].toLowerCase();
  if (hostname.length > 253 || !hostname.split('.').every((part) =>
    part.length >= 1 && part.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) return null;
  return { hostname, pathname: match[2] || '/' };
}

export function encodeQueryParams(params) {
  return Object.entries(params).map(([key, value]) =>
    encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&');
}

export function validTrackId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value);
}

export function parseRequest(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input || input.length > 2048) return { kind: 'invalid' };
  if (/^https?:\/\//i.test(input)) {
    const url = parseHttpsUrl(input);
    if (!url || !YANDEX_HOSTS.has(url.hostname)) return { kind: 'unsupported' };
    const path = url.pathname.replace(/\/+$/, '');
    const album = /^\/album\/\d+\/track\/(\d+)$/.exec(path);
    const track = /^\/track\/(\d+)$/.exec(path);
    const id = (album || track)?.[1];
    return validTrackId(id) ? { kind: 'track', id } : { kind: 'unsupported' };
  }
  if (/^[a-z][\w+.-]*:/i.test(input)) return { kind: 'unsupported' };
  if (/^(?:\/|@)/.test(input)) return { kind: 'invalid' };
  const query = input.replace(/\s+/g, ' ');
  return query.length >= 2 && query.length <= 120 ? { kind: 'search', query } : { kind: 'invalid' };
}

export function parseAction(data) {
  if (data === 'nav:home') return { kind: 'home' };
  if (data === 'nav:help') return { kind: 'help' };
  // Accept existing Yandex buttons (track:y:id) after the provider migration.
  const match = /^(track|download):(?:y:)?([1-9]\d{0,15})$/.exec(data || '');
  return match ? { kind: match[1], id: match[2] } : { kind: 'invalid' };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function trimLabel(value, length = 48) {
  const s = String(value ?? '').replace(/[\r\n\t]/g, ' ').trim();
  return s.length > length ? s.slice(0, length - 1) + '…' : s;
}

export function isYandexAudioUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname;
  const allowed = host === 'strm.yandex.net' ||
    host.endsWith('.strm.yandex.net') ||
    host === 'storage.yandex.net' ||
    host.endsWith('.storage.yandex.net') ||
    host === 'storage.mds.yandex.net' ||
    host.endsWith('.storage.mds.yandex.net');
  return allowed && (url.pathname.startsWith('/music-v2/raw/') ||
    url.pathname.startsWith('/get-mp3/'));
}

export function displayDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const n = Math.round(seconds);
  return String(Math.floor(n / 60)) + ':' + String(n % 60).padStart(2, '0');
}

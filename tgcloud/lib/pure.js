const YANDEX_HOSTS = new Set(['music.yandex.ru', 'music.yandex.com', 'music.yandex.by']);
const JAMENDO_HOSTS = new Set(['jamendo.com', 'www.jamendo.com']);

// Telegram Cloud runs JavaScript in a bare V8 isolate, not a browser or Node.
// Parse a strictly limited HTTPS URL here instead of relying on browser globals.
// The returned hostname/pathname are enough for fixed-domain music links.
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

export function parseRequest(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input || input.length > 2048) return { kind: 'invalid' };
  if (/^https?:\/\//i.test(input)) {
    const url = parseHttpsUrl(input);
    if (!url) return { kind: 'unsupported' };
    const host = url.hostname;
    const path = url.pathname.replace(/\/+$/, '');
    if (YANDEX_HOSTS.has(host)) {
      const album = /^\/album\/\d+\/track\/(\d+)$/.exec(path);
      const track = /^\/track\/(\d+)$/.exec(path);
      const match = album || track;
      return match && validTrackId(match[1])
        ? { kind: 'track', source: 'y', id: match[1] }
        : { kind: 'unsupported' };
    }
    if (JAMENDO_HOSTS.has(host)) {
      const match = /^\/track\/(\d+)(?:\/[^/]*)?$/.exec(path);
      return match && validTrackId(match[1])
        ? { kind: 'track', source: 'j', id: match[1] }
        : { kind: 'unsupported' };
    }
    return { kind: 'unsupported' };
  }
  if (/^[a-z][\w+.-]*:/i.test(input)) return { kind: 'unsupported' };
  if (/^(?:\/|@)/.test(input)) return { kind: 'invalid' };
  const query = input.replace(/\s+/g, ' ');
  return query.length >= 2 && query.length <= 120 ? { kind: 'search', query } : { kind: 'invalid' };
}

export function validTrackId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value);
}

export function parseAction(data) {
  if (data === 'nav:home') return { kind: 'home' };
  if (data === 'nav:help') return { kind: 'help' };
  const match = /^(track|download):(y|j):([1-9]\d{0,15})$/.exec(data || '');
  if (!match) return { kind: 'invalid' };
  return { kind: match[1], source: match[2], id: match[3] };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function trimLabel(value, length = 48) {
  const s = String(value ?? '').replace(/[\r\n\t]/g, ' ').trim();
  return s.length > length ? s.slice(0, length - 1) + '…' : s;
}

export function isJamendoUrl(value) {
  const url = parseHttpsUrl(value);
  return Boolean(url && (url.hostname === 'jamendo.com' ||
    url.hostname.endsWith('.jamendo.com')));
}

export function isYandexAudioUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname;
  const permitted = host === 'strm.yandex.net' ||
    host.endsWith('.strm.yandex.net') ||
    host === 'storage.yandex.net' ||
    host.endsWith('.storage.yandex.net') ||
    host === 'storage.mds.yandex.net' ||
    host.endsWith('.storage.mds.yandex.net');
  return permitted && (url.pathname.startsWith('/music-v2/raw/') ||
    url.pathname.startsWith('/get-mp3/'));
}

export function displayDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const n = Math.round(seconds);
  return String(Math.floor(n / 60)) + ':' + String(n % 60).padStart(2, '0');
}

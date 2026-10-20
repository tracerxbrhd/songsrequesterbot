const YANDEX_HOSTS = new Set(['music.yandex.ru', 'music.yandex.com', 'music.yandex.by']);
const JAMENDO_HOSTS = new Set(['jamendo.com', 'www.jamendo.com']);

export function parseRequest(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input || input.length > 500) return { kind: 'invalid' };
  if (/^https?:\/\//i.test(input)) {
    let url;
    try { url = new URL(input); } catch (_) { return { kind: 'unsupported' }; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return { kind: 'unsupported' };
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '');
    if (YANDEX_HOSTS.has(host)) {
      const album = /^\/album\/\d+\/track\/(\d+)$/.exec(path);
      const track = /^\/track\/(\d+)$/.exec(path);
      const match = album || track;
      return match ? { kind: 'track', source: 'y', id: match[1] } : { kind: 'unsupported' };
    }
    if (JAMENDO_HOSTS.has(host)) {
      const match = /^\/track\/(\d+)(?:\/[^/]*)?$/.exec(path);
      return match ? { kind: 'track', source: 'j', id: match[1] } : { kind: 'unsupported' };
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
  if (match[1] === 'download' && match[2] !== 'j') return { kind: 'invalid' };
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
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (host === 'jamendo.com' || host.endsWith('.jamendo.com'));
  } catch (_) { return false; }
}

export function displayDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const n = Math.round(seconds);
  return String(Math.floor(n / 60)) + ':' + String(n % 60).padStart(2, '0');
}

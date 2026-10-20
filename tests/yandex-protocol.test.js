import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  YANDEX_ANDROID_CLIENT, YANDEX_DESKTOP_CLIENT,
  yandexHeaders, yandexHttpError, unwrapYandexEnvelope, parseTrackResult, parseSearchResult,
  publicYandexError, safeYandexErrorCode,
} from '../tgcloud/lib/providers/yandex-protocol.js';

test('metadata uses Android profile and MP3 file-info uses desktop profile', () => {
  const normal = yandexHeaders('dummy-token');
  const audio = yandexHeaders('dummy-token', 'desktop');
  assert.equal(normal['X-Yandex-Music-Client'], YANDEX_ANDROID_CLIENT);
  assert.equal(audio['X-Yandex-Music-Client'], YANDEX_DESKTOP_CLIENT);
  assert.equal(normal.Authorization, 'OAuth dummy-token');
  assert.equal(audio.Authorization, 'OAuth dummy-token');
  assert.equal(yandexHeaders('', 'android').Authorization, undefined);
});

test('track parser enforces array result instead of silently returning not found', () => {
  const track = { id: 126278860, title: 'Монополия' };
  assert.deepEqual(parseTrackResult([track]), [track]);
  assert.throws(() => parseTrackResult({ tracks: [track] }), /YANDEX_TRACK_SCHEMA/);
});

test('search extracts the real results envelope and optional best match', () => {
  const song = { id: 126278860, title: 'Монополия' };
  assert.deepEqual(parseSearchResult({ tracks: { results: [song] } }), [song]);
  assert.deepEqual(parseSearchResult({ tracks: { results: [] } }), []);
  assert.deepEqual(parseSearchResult({ tracks: { results: [] }, best: {
    type: 'track', result: song,
  } }), [song]);
  assert.deepEqual(parseSearchResult({ best: null, tracks: null }), []);
  assert.throws(() => parseSearchResult(null), /YANDEX_SEARCH_SCHEMA/);
  assert.throws(() => parseSearchResult({ tracks: { results: {} } }), /YANDEX_SEARCH_SCHEMA/);
});

test('HTTP codes are classified without echoing private server payloads', () => {
  assert.equal(yandexHttpError(401), 'YANDEX_HTTP_401');
  assert.equal(yandexHttpError(403), 'YANDEX_HTTP_403');
  assert.equal(yandexHttpError(429), 'YANDEX_HTTP_429');
  assert.equal(yandexHttpError(503), 'YANDEX_HTTP_5XX');
  assert.equal(safeYandexErrorCode(new Error('https://example.com/?oauth=secret')),
    'YANDEX_UNEXPECTED');
  assert.match(publicYandexError(new Error('YANDEX_HTTP_403')), /HTTP 403/);
  assert.doesNotMatch(
    publicYandexError(new Error('https://example.com/?oauth=secret')),
    /secret|example.com/,
  );
});

test('unwrapped Yandex API envelopes support standard result and direct file info', () => {
  assert.deepEqual(unwrapYandexEnvelope({ result: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(unwrapYandexEnvelope({ downloadInfo: { codec: 'mp3' } }, 'desktop'),
    { downloadInfo: { codec: 'mp3' } });
  assert.throws(() => unwrapYandexEnvelope({ downloadInfo: {} }, 'android'),
    /YANDEX_RESULT_MISSING/);
  assert.throws(() => unwrapYandexEnvelope({ error: 'Unauthorized' }), /YANDEX_API_ERROR/);
});

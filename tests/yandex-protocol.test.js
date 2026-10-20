import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  YANDEX_ANDROID_CLIENT, YANDEX_DESKTOP_CLIENT, yandexHeaders,
  yandexTrackLookup, yandexHttpError, confirmedYandexAccount, unwrapYandexEnvelope,
  parseTrackResult, parseSearchResult, publicYandexError, safeYandexErrorCode,
} from '../tgcloud/lib/providers/yandex-protocol.js';

test('account metadata and search use Android, raw MP3 uses desktop profile', () => {
  const normal = yandexHeaders('test-token');
  const audio = yandexHeaders('test-token', 'desktop');
  assert.equal(normal['X-Yandex-Music-Client'], YANDEX_ANDROID_CLIENT);
  assert.equal(audio['X-Yandex-Music-Client'], YANDEX_DESKTOP_CLIENT);
  assert.equal(normal.Authorization, 'OAuth test-token');
  assert.equal(audio.Authorization, 'OAuth test-token');
  assert.equal(yandexHeaders('').Authorization, undefined);
});

test('track metadata request is POST /tracks with x-www-form-urlencoded track-ids', () => {
  const request = yandexTrackLookup('126278860');
  assert.equal(request.path, '/tracks');
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.form, {
    'with-positions': 'True',
    'track-ids': '126278860',
  });
  assert.equal(new URLSearchParams(request.form).get('track-ids'), '126278860');
  assert.throws(() => yandexTrackLookup('126278860;bad'), /YANDEX_TRACK_INVALID/);
});

test('tracks and search parse real envelope shapes', () => {
  const track = { id: 126278860, title: 'Монополия' };
  assert.deepEqual(parseTrackResult([track]), [track]);
  assert.deepEqual(parseTrackResult(null), []);
  assert.throws(() => parseTrackResult({ tracks: [track] }), /YANDEX_TRACK_SCHEMA/);
  assert.deepEqual(parseSearchResult({ tracks: { results: [track] } }), [track]);
  assert.deepEqual(parseSearchResult({ tracks: { results: [] } }), []);
  assert.deepEqual(parseSearchResult({ tracks: { results: [] },
    best: { type: 'track', result: track } }), [track]);
  assert.throws(() => parseSearchResult({ tracks: { results: {} } }), /YANDEX_SEARCH_SCHEMA/);
});

test('standard and desktop envelopes are handled separately', () => {
  assert.deepEqual(unwrapYandexEnvelope({ result: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(unwrapYandexEnvelope({
    downloadInfo: { codec: 'mp3' },
  }, 'desktop'), { downloadInfo: { codec: 'mp3' } });
  assert.throws(() => unwrapYandexEnvelope({ downloadInfo: {} }, 'android'),
    /YANDEX_RESULT_MISSING/);
});

test('HTTP 400, 403 and 429 are distinguishable without displaying server responses', () => {
  for (const code of [400, 401, 403, 404, 408, 422, 429]) {
    assert.equal(yandexHttpError(code), 'YANDEX_HTTP_' + code);
  }
  assert.equal(yandexHttpError(405), 'YANDEX_HTTP_405');
  assert.equal(yandexHttpError(451), 'YANDEX_HTTP_451');
  assert.equal(yandexHttpError(418), 'YANDEX_HTTP_418');
  assert.equal(yandexHttpError(503), 'YANDEX_HTTP_503');
  assert.equal(yandexHttpError('451'), 'YANDEX_HTTP_451');
  assert.equal(yandexHttpError(undefined), 'YANDEX_HTTP_UNKNOWN');
  assert.equal(yandexHttpError({ status: 451 }), 'YANDEX_HTTP_UNKNOWN');
  assert.match(publicYandexError(new Error('YANDEX_HTTP_400')), /400/);
  assert.match(publicYandexError(new Error('YANDEX_HTTP_403')), /403/);
  assert.equal(safeYandexErrorCode(new Error('https://example.com?token=secret')),
    'YANDEX_UNEXPECTED');
  assert.doesNotMatch(publicYandexError(new Error('https://example.com?token=secret')),
    /example.com|secret/);
});

test('only actual account.uid validates the OAuth account probe', () => {
  assert.equal(confirmedYandexAccount({ account: { uid: 123456 } }), true);
  assert.equal(confirmedYandexAccount({ account: { uid: '123456' } }), true);
  assert.equal(confirmedYandexAccount({ account: {} }), false);
  assert.equal(confirmedYandexAccount({ account: { uid: 0 } }), false);
  assert.equal(confirmedYandexAccount({}), false);
  assert.equal(confirmedYandexAccount(null), false);
});

test('HTTP 405 and 451 diagnostics preserve exact codes without leaking private data', () => {
  assert.match(publicYandexError(new Error('YANDEX_HTTP_405')), /405/);
  assert.match(publicYandexError(new Error('YANDEX_HTTP_451')), /451/);
  assert.match(publicYandexError(new Error('YANDEX_HTTP_412')), /412/);
  assert.match(publicYandexError(new Error('YANDEX_HTTP_503')), /503/);
  assert.match(publicYandexError(new Error('YANDEX_ACCOUNT_UNVERIFIED')), /OAuth|аккаунт|запрос|Яндекс/i);
  const arbitrary = new Error('YANDEX_HTTP_451?oauth=secret');
  assert.equal(safeYandexErrorCode(arbitrary), 'YANDEX_UNEXPECTED');
  assert.doesNotMatch(publicYandexError(arbitrary), /secret|oauth=/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRequest, parseAction, escapeHtml, isJamendoUrl, displayDuration,
} from '../tgcloud/lib/pure.js';
import { normalizeYandex, normalizeJamendo } from '../tgcloud/lib/providers/normalize.js';

test('parses Yandex album and track links', () => {
  assert.deepEqual(parseRequest('https://music.yandex.ru/album/123/track/456?utm_source=share'),
    { kind: 'track', source: 'y', id: '456' });
  assert.deepEqual(parseRequest('https://music.yandex.ru/track/42'),
    { kind: 'track', source: 'y', id: '42' });
});

test('parses Jamendo track and search terms', () => {
  assert.deepEqual(parseRequest('https://www.jamendo.com/track/1234/demo'),
    { kind: 'track', source: 'j', id: '1234' });
  assert.deepEqual(parseRequest('  Artist  —  Song  '),
    { kind: 'search', query: 'Artist — Song' });
});

test('rejects offsite URLs, spoofed domains and unsafe protocols', () => {
  for (const url of [
    'https://music.yandex.ru.evil.tld/track/123',
    'http://music.yandex.ru/track/123',
    'https://user:pass@music.yandex.ru/track/123',
    'https://www.jamendo.com:8443/track/123',
    'file:///etc/passwd',
    'https://www.jamendo.com/album/123',
  ]) {
    assert.equal(parseRequest(url).kind, 'unsupported', url);
  }
});

test('validates bounds and callback actions', () => {
  assert.equal(parseRequest('x').kind, 'invalid');
  assert.equal(parseRequest('x'.repeat(501)).kind, 'invalid');
  assert.deepEqual(parseAction('download:j:1234'), { kind: 'download', source: 'j', id: '1234' });
  assert.equal(parseAction('download:y:1234').kind, 'invalid');
  assert.equal(parseAction('track:y:0').kind, 'invalid');
  assert.equal(parseAction('track:y:123:fake').kind, 'invalid');
});

test('escapes untrusted metadata for Telegram HTML mode', () => {
  assert.equal(escapeHtml('A&B <"C">'), 'A&amp;B &lt;&quot;C&quot;&gt;');
  assert.equal(displayDuration(202), '3:22');
});

test('normalizes Yandex metadata without a download URL', () => {
  const track = normalizeYandex({
    id: 456, title: 'Test', artists: [{ name: 'Composer' }], durationMs: 83000,
    albums: [{ title: 'Album' }],
  });
  assert.equal(track.artist, 'Composer');
  assert.equal(track.duration, 83);
  assert.equal(track.downloadAllowed, false);
  assert.equal(track.downloadUrl, null);
});

test('Jamendo honors audiodownload_allowed and validates URL hosts', () => {
  assert.equal(isJamendoUrl('https://mp3d.jamendo.com/?trackid=1'), true);
  assert.equal(isJamendoUrl('https://jamendo.com.evil.tld/track/1'), false);
  const sample = { id: 1, name: 'Song', artist_name: 'Artist',
    audiodownload: 'https://mp3d.jamendo.com/?trackid=1' };
  assert.equal(normalizeJamendo({ ...sample, audiodownload_allowed: true }).downloadAllowed, true);
  assert.equal(normalizeJamendo({ ...sample, audiodownload_allowed: false }).downloadAllowed, false);
  assert.equal(normalizeJamendo({ ...sample, audiodownload_allowed: true,
    audiodownload: 'https://other.example/audio.mp3' }).downloadAllowed, false);
});

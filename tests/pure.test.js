import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRequest, parseAction, escapeHtml, isYandexAudioUrl, displayDuration,
} from '../tgcloud/lib/pure.js';
import { normalizeYandex } from '../tgcloud/lib/providers/normalize.js';

const shareUrl = 'https://music.yandex.ru/album/31348570/track/126278860' +
  '?utm_medium=copy_link&ref_id=05e01435-563e-405b-ae60-2d99edc7acfe';

test('Yandex share and direct track links resolve to the same track', () => {
  assert.deepEqual(parseRequest(shareUrl), { kind: 'track', id: '126278860' });
  assert.deepEqual(parseRequest('https://music.yandex.ru/track/126278860'),
    { kind: 'track', id: '126278860' });
  assert.deepEqual(parseRequest('https://music.yandex.by/album/9/track/7'),
    { kind: 'track', id: '7' });
});

test('search text is normalized, with no other providers', () => {
  assert.deepEqual(parseRequest(' Монеточка    Монополия '),
    { kind: 'search', query: 'Монеточка Монополия' });
  assert.equal(parseRequest('https://www.jamendo.com/track/1234').kind, 'unsupported');
  assert.equal(parseRequest('https://open.spotify.com/track/456').kind, 'unsupported');
  assert.equal(parseRequest('X').kind, 'invalid');
});

test('rejects spoofed domains and unsafe protocols', () => {
  for (const link of [
    'http://music.yandex.ru/track/123',
    'https://music.yandex.ru.evil.tld/track/123',
    'https://user:pass@music.yandex.ru/track/123',
    'https://music.yandex.ru:443/track/123',
    'https://music.yandex.ru/album/1/track/0',
    'file:///etc/passwd',
  ]) {
    assert.notEqual(parseRequest(link).kind, 'track', link);
  }
});

test('callbacks work for new and pre-migration Yandex buttons only', () => {
  assert.deepEqual(parseAction('track:126278860'), { kind: 'track', id: '126278860' });
  assert.deepEqual(parseAction('track:y:126278860'), { kind: 'track', id: '126278860' });
  assert.deepEqual(parseAction('download:y:126278860'), { kind: 'download', id: '126278860' });
  assert.deepEqual(parseAction('download:126278860'), { kind: 'download', id: '126278860' });
  assert.equal(parseAction('download:j:1234').kind, 'invalid');
  assert.equal(parseAction('track:0').kind, 'invalid');
  assert.equal(parseAction('track:123:garbage').kind, 'invalid');
});

test('metadata is escaped and normalized', () => {
  assert.equal(escapeHtml('A&B <"C">'), 'A&amp;B &lt;&quot;C&quot;&gt;');
  assert.equal(displayDuration(202), '3:22');
  const track = normalizeYandex({
    id: 126278860, title: 'Монополия', artists: [{ name: 'Монеточка' }],
    durationMs: 201000, albums: [{ title: 'Альбом' }],
  });
  assert.equal(track.id, '126278860');
  assert.equal(track.title, 'Монополия');
  assert.equal(track.artist, 'Монеточка');
  assert.equal(track.duration, 201);
  assert.equal(track.url, 'https://music.yandex.ru/track/126278860');
});

test('only approved HTTPS raw MP3 CDN paths are accepted', () => {
  assert.equal(isYandexAudioUrl('https://media.strm.yandex.net/music-v2/raw/a.mp3'), true);
  assert.equal(isYandexAudioUrl('https://s50vla.storage.yandex.net/get-mp3/abc/123/a.mp3'), true);
  assert.equal(isYandexAudioUrl('https://music.yandex.ru/track/123'), false);
  assert.equal(isYandexAudioUrl('https://strm.yandex.net.evil.tld/music-v2/raw/a.mp3'), false);
  assert.equal(isYandexAudioUrl('https://media.strm.yandex.net/music-v2/encraw/a.mp3'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  encodeQueryParams, parseHttpsUrl, parseRequest, isYandexAudioUrl,
} from '../tgcloud/lib/pure.js';

const shareUrl = 'https://music.yandex.ru/album/31348570/track/126278860' +
  '?utm_medium=copy_link&ref_id=05e01435-563e-405b-ae60-2d99edc7acfe';

test('works in a Serverless V8 isolate without URL globals', () => {
  const oldURL = globalThis.URL;
  const oldParams = globalThis.URLSearchParams;
  try {
    globalThis.URL = undefined;
    globalThis.URLSearchParams = undefined;
    assert.deepEqual(parseRequest(shareUrl), { kind: 'track', id: '126278860' });
    assert.equal(isYandexAudioUrl('https://media.strm.yandex.net/music-v2/raw/x.mp3'), true);
    assert.equal(encodeQueryParams({ ts: 123, sign: 'A+B/= z', codecs: 'mp3' }),
      'ts=123&sign=A%2BB%2F%3D%20z&codecs=mp3');
  } finally {
    globalThis.URL = oldURL;
    globalThis.URLSearchParams = oldParams;
  }
});

test('strict parser rejects unsafe or spoofed authority', () => {
  for (const link of [
    'http://music.yandex.ru/album/1/track/2',
    'https://evil.example/music.yandex.ru/track/2',
    'https://music.yandex.ru.evil.example/track/2',
    'https://user@music.yandex.ru/track/2',
    'https://music.yandex.ru:443/track/2',
    'https://music.yandex.ru\\@evil.example/track/2',
    'https://music..yandex.ru/track/2',
    'https://music.yandex.ru/track/2\nhttps://evil.example',
  ]) assert.equal(parseRequest(link).kind, 'unsupported', link);
});

test('deployed JavaScript contains no unavailable browser URL constructors or Jamendo modules', () => {
  const root = new URL('../tgcloud/', import.meta.url);
  const found = [];
  function scan(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, ent.name);
      if (ent.isDirectory()) scan(path);
      else if (ent.isFile() && ent.name.endsWith('.js')) {
        found.push(path);
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /\bnew\s+URL(?:SearchParams)?\s*\(/,
          path + ': unavailable runtime globals');
        assert.doesNotMatch(source, /Jamendo|JAMENDO|jamendo/i,
          path + ': removed provider');
      }
    }
  }
  scan(root.pathname);
  assert.ok(found.some(path => path.endsWith('yandex.js')));
});

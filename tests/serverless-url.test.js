import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  encodeQueryParams, parseHttpsUrl, parseRequest, isJamendoUrl, isYandexAudioUrl,
} from '../tgcloud/lib/pure.js';

const realShareLink =
  'https://music.yandex.ru/album/31348570/track/126278860' +
  '?utm_medium=copy_link&ref_id=05e01435-563e-405b-ae60-2d99edc7acfe';

test('recognizes the exact Telegram Yandex Music share link', () => {
  assert.deepEqual(parseRequest(realShareLink), {
    kind: 'track', source: 'y', id: '126278860',
  });
  assert.deepEqual(parseRequest('https://music.yandex.ru/track/126278860'), {
    kind: 'track', source: 'y', id: '126278860',
  });
});

test('parses real links and audio URLs without browser URL globals', () => {
  const previousURL = globalThis.URL;
  const previousParams = globalThis.URLSearchParams;
  try {
    // Simulates the V8 Serverless isolate, where these browser globals are absent.
    globalThis.URL = undefined;
    globalThis.URLSearchParams = undefined;
    assert.deepEqual(parseRequest(realShareLink), {
      kind: 'track', source: 'y', id: '126278860',
    });
    assert.deepEqual(parseRequest('https://www.jamendo.com/track/1234/test'), {
      kind: 'track', source: 'j', id: '1234',
    });
    assert.equal(isJamendoUrl('https://mp3d.jamendo.com/?trackid=1234'), true);
    assert.equal(isYandexAudioUrl('https://media.strm.yandex.net/music-v2/raw/abc/mp3'), true);
    assert.equal(encodeQueryParams({ ts: 123, sign: 'A+B/= z', codecs: 'mp3' }),
      'ts=123&sign=A%2BB%2F%3D%20z&codecs=mp3');
  } finally {
    globalThis.URL = previousURL;
    globalThis.URLSearchParams = previousParams;
  }
});

test('restricted parser rejects ambiguous, unsafe and spoofed host syntax', () => {
  for (const link of [
    'http://music.yandex.ru/album/1/track/2',
    'https://evil.example/music.yandex.ru/track/2',
    'https://music.yandex.ru.evil.example/track/2',
    'https://user@music.yandex.ru/track/2',
    'https://music.yandex.ru:443/track/2',
    'https://music.yandex.ru\\@evil.example/track/2',
    'https://music..yandex.ru/track/2',
    'https://music.yandex.ru/track/2\nhttps://evil.example',
    'https://music.yandex.ru/album/1/track/0',
  ]) {
    assert.notEqual(parseRequest(link).kind, 'track', link);
  }
  assert.equal(parseHttpsUrl('https://media.strm.yandex.net/music-v2/raw/abc?token=abc')?.hostname,
    'media.strm.yandex.net');
});

test('Serverless deployed code never constructs missing URL globals', () => {
  const root = new URL('../tgcloud/', import.meta.url);
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /\bnew\s+URL(?:SearchParams)?\s*\(/,
          path + ' must not construct missing browser URL globals');
      }
    }
  }
  scan(root.pathname);
});

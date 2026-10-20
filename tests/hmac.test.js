import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hmacSha256, yandexFileInfoSignature } from '../tgcloud/lib/crypto-hmac.js';

const hex = (data) => Array.from(data, (n) => n.toString(16).padStart(2, '0')).join('');

test('pure JS HMAC matches Node crypto for short and multi-block input', () => {
  for (const [key, value] of [
    ['key', 'The quick brown fox jumps over the lazy dog'],
    ['x', 'abc'],
    ['custom', '#'.repeat(210)],
    ['large'.repeat(25), 'some message'],
  ]) {
    const expected = createHmac('sha256', key).update(value).digest('hex');
    assert.equal(hex(hmacSha256(key, value)), expected);
  }
});

test('signed get-file-info parameters match Yandex desktop client', () => {
  const timestamp = 1700000000, id = '123456';
  const message = '1700000000123456hqmp3raw';
  assert.equal(
    yandexFileInfoSignature(id, 'hq', ['mp3'], 'raw', timestamp),
    createHmac('sha256', 'kzqU4XhfCaY6B6JTHODeq5')
      .update(message).digest('base64').slice(0, -1),
  );
});

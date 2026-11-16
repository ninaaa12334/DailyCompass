import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHmac, createDecipheriv, randomBytes, createPublicKey, verify } from 'node:crypto';
import { createRequire } from 'node:module';
import { encryptPayload, vapidHeaders, b64url } from '../src/webpush.js';

const require = createRequire(import.meta.url);
const webpush = require('../../node_modules/web-push');

// Independent RFC 8291 decryption (what a browser does), written with node:crypto.
function decrypt(body, uaECDH, authSecret) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ciphertext = body.subarray(21 + idlen);
  const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
  const shared = uaECDH.computeSecret(asPublic), uaPublic = uaECDH.getPublicKey();
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return plain.subarray(0, plain.length - 1).toString();
}

function browserKeys() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, keys: { p256dh: b64url.encode(ecdh.getPublicKey()), auth: b64url.encode(auth) } };
}

test('our encryption decrypts to the original message', async () => {
  const { ecdh, auth, keys } = browserKeys();
  const message = JSON.stringify({ title: 'Football', body: 'Starts at 17:00 · in 10 min ⚽' });
  const body = Buffer.from(await encryptPayload(message, keys));
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(decrypt(body, ecdh, auth), message);
});

test('the same decryption opens messages from the web-push library (cross-check)', () => {
  const { ecdh, auth, keys } = browserKeys();
  const result = webpush.encrypt(keys.p256dh, keys.auth, 'hello from web-push', 'aes128gcm');
  assert.equal(decrypt(Buffer.from(result.cipherText), ecdh, auth), 'hello from web-push');
});

test('VAPID token is a valid ES256 signature for the push service origin', async () => {
  const pair = webpush.generateVAPIDKeys();
  const { Authorization } = await vapidHeaders('https://fcm.googleapis.com/fcm/send/abc', { publicKey: pair.publicKey, privateKey: pair.privateKey, subject: 'https://daily-compass1.vercel.app' }, Date.UTC(2026, 10, 15));
  const [, jwt, k] = Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, pair.publicKey);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(b64url.decode(c)).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.equal(claims.sub, 'https://daily-compass1.vercel.app');
  const pub = b64url.decode(pair.publicKey);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url.encode(pub.slice(1, 33)), y: b64url.encode(pub.slice(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64url.decode(s))));
});

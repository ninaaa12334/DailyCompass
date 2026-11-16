// Web Push with only WebCrypto (works in Cloudflare Workers and Node):
// - RFC 8292 (VAPID): a signed token proving the message comes from this service.
// - RFC 8291 (aes128gcm): the message is encrypted so only the receiving browser can read it.

const enc = new TextEncoder();
export const b64url = {
  encode(bytes) { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  decode(text) { const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(text).length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); }
};
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

// ----- VAPID -----
export async function vapidHeaders(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const pub = b64url.decode(publicKey);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: privateKey, x: b64url.encode(pub.slice(1, 33)), y: b64url.encode(pub.slice(33, 65)), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return { Authorization: `vapid t=${header}.${claims}.${b64url.encode(signature)}, k=${publicKey}` };
}

// ----- Payload encryption (aes128gcm) -----
export async function encryptPayload(payload, { p256dh, auth }, test = {}) {
  const uaPublic = b64url.decode(p256dh), authSecret = b64url.decode(auth);
  const local = test.localKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  // IKM = HKDF(auth secret, shared secret, "WebPush: info" || 0x00 || ua_public || as_public)
  const prkKey = await hmac(authSecret, shared);
  const ikm = (await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32);
  const salt = test.salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const plaintext = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = last (and only) record
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPublic.length; header.set(asPublic, 21);
  return concat(header, ciphertext);
}

// Sends one notification. Returns the push service's HTTP status (201 = accepted, 404/410 = device gone).
export async function sendPush(subscription, payload, vapid, { ttl = 3600, urgency = 'high' } = {}) {
  const body = await encryptPayload(JSON.stringify(payload), subscription.keys);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: { ...(await vapidHeaders(subscription.endpoint, vapid)), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: urgency },
    body
  });
  return response.status;
}

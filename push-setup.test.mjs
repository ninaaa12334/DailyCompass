import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { configurePushEnvironment } from './scripts/setup-push.mjs';

test('push setup keeps credentials and existing subscriptions keys, generates only an absent pair', () => {
  let generated = 0;
  const generate = () => { generated++; return { publicKey: 'test-public', privateKey: 'test-private' }; };
  const source = '# Keep this comment\nCLERK_SECRET_KEY=test-only\nVAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_SUBJECT=\n';
  const once = configurePushEnvironment(source, 'contact@example.com', generate);
  assert.equal(parseEnv(once).VAPID_SUBJECT, 'mailto:contact@example.com');
  assert.match(once, /# Keep this comment/); assert.equal(parseEnv(once).CLERK_SECRET_KEY, 'test-only');
  const twice = configurePushEnvironment(once, 'new@example.com', generate);
  assert.equal(generated, 1); assert.equal(parseEnv(twice).VAPID_PRIVATE_KEY, 'test-private');
  assert.throws(() => configurePushEnvironment(source, 'bad\nVAPID_PRIVATE_KEY=oops', generate));
  assert.throws(() => configurePushEnvironment('VAPID_PUBLIC_KEY=existing\n', 'contact@example.com', generate), /matching pair/);
});

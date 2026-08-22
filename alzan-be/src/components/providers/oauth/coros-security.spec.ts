import { strict as assert } from 'assert';
import * as security from './coros-security';
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const encrypted = security.encryptCorosToken('coros-access-token', encryptionKey);
assert.match(encrypted, /^enc:v1:/);
assert.notEqual(encrypted, 'coros-access-token');
assert.equal(security.decryptCorosToken(encrypted, encryptionKey), 'coros-access-token');
assert.throws(() => security.decryptCorosToken(`${encrypted.slice(0, -1)}x`, encryptionKey));

assert.equal(security.isCorosUserAllowed({ mode: 'public', pilotUserIds: undefined, userId: 'user-a' }), true);
assert.equal(security.isCorosUserAllowed({ mode: 'disabled', pilotUserIds: 'user-a', userId: 'user-a' }), false);
assert.equal(security.isCorosUserAllowed({ mode: 'pilot', pilotUserIds: ' user-a,user-b ', userId: 'user-b' }), true);
assert.equal(security.isCorosUserAllowed({ mode: 'pilot', pilotUserIds: 'user-a', userId: 'user-c' }), false);

assert.equal(
  security.validateCorosFitUrl('https://oss.coros.com/fit/example.fit', ['oss.coros.com']).hostname,
  'oss.coros.com',
);
assert.throws(() => security.validateCorosFitUrl('http://oss.coros.com/fit/example.fit', ['oss.coros.com']));
assert.throws(() => security.validateCorosFitUrl('https://attacker.example/example.fit', ['oss.coros.com']));
assert.throws(() => security.validateCorosFitUrl('https://user:pass@oss.coros.com/example.fit', ['oss.coros.com']));
assert.throws(() => security.validateCorosFitUrl('https://oss.coros.com/example.html', ['oss.coros.com']));

const webhookCredentials = {
  expectedClient: 'partner-client',
  expectedSecret: 'partner-secret',
};
assert.equal(
  security.verifyCorosWebhookCredentials({
    ...webhookCredentials,
    actualClient: 'partner-client',
    actualSecret: 'partner-secret',
  }),
  true,
);
assert.equal(
  security.verifyCorosWebhookCredentials({
    ...webhookCredentials,
    actualClient: 'partner-client',
    actualSecret: 'wrong-secret',
  }),
  false,
);
assert.equal(
  security.verifyCorosWebhookCredentials({
    ...webhookCredentials,
    actualClient: undefined,
    actualSecret: undefined,
  }),
  false,
);

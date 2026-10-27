import assert from 'node:assert/strict';
import { createLoggerConfig } from './logger.config';

const originalEnvironment = process.env.NODE_ENV;
try {
  process.env.NODE_ENV = 'development';
  const options = createLoggerConfig().pinoHttp;
  assert.ok(options && !Array.isArray(options) && 'level' in options);
  assert.equal(options.level, 'info', 'hosted environments must not log every debug event');
  assert.ok('serializers' in options && options.serializers);
  const serialize = options.serializers.req;
  assert.equal(typeof serialize, 'function');
  const request = {
    id: 'request-id',
    method: 'POST',
    url: '/webhooks/coros/workouts?token=secret-token&code=oauth-code',
    headers: { authorization: 'Bearer secret-access', cookie: 'secret-session', secret: 'secret-webhook' },
    body: { password: 'secret-password', weight: 75 },
  };
  const serialized: unknown = serialize(request);
  assert.ok(serialized && typeof serialized === 'object' && 'url' in serialized && 'method' in serialized);
  const output = JSON.stringify(serialized);
  assert.equal(serialized.url, '/webhooks/coros/workouts');
  assert.equal(serialized.method, 'POST');
  assert.doesNotMatch(output, /secret-|oauth-code|weight|password|headers|cookie/);
  process.env.NODE_ENV = 'local';
  const localOptions = createLoggerConfig().pinoHttp;
  assert.ok(localOptions && !Array.isArray(localOptions) && 'serializers' in localOptions && localOptions.serializers);
  assert.doesNotMatch(JSON.stringify(localOptions.serializers.req(request)), /secret-|oauth-code/);
} finally {
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
}
console.log('Request logging: production level and credential/payload exclusion passed');

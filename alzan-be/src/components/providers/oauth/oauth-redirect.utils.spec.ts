import assert from 'node:assert/strict';
import { isAllowedOAuthRedirectUri } from './oauth-redirect.utils';

const frontend = 'https://app.alzan.com';

assert.equal(isAllowedOAuthRedirectUri('alzan://oauth/success', frontend), true);
assert.equal(isAllowedOAuthRedirectUri('alzan://oauth/error', frontend), true);
assert.equal(isAllowedOAuthRedirectUri('https://app.alzan.com/oauth/suunto/success', frontend), true);
assert.equal(isAllowedOAuthRedirectUri('https://app.alzan.com.evil.example/callback', frontend), false);
assert.equal(isAllowedOAuthRedirectUri('https://evil.example/callback', frontend), false);
assert.equal(isAllowedOAuthRedirectUri('javascript:alert(1)', frontend), false);
assert.equal(isAllowedOAuthRedirectUri('https://app.alzan.com@evil.example/callback', frontend), false);

console.log('OAuth redirect validation tests passed');

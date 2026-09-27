import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { clearTemporaryQueryCache } from './clearTemporaryQueryCache';

const client = new QueryClient();
client.setQueryData(['inactive'], 'cached');
client.setQueryData(['active'], 'visible');
const observer = new QueryObserver(client, { queryKey: ['active'], enabled: false });
const unsubscribe = observer.subscribe(() => undefined);
clearTemporaryQueryCache(client);
assert.equal(client.getQueryData(['inactive']), undefined);
assert.equal(client.getQueryData(['active']), 'visible');
unsubscribe();
client.clear();

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
assert.doesNotMatch(read('../../hooks/settings/useSettingsPrivacy.ts'), /AsyncStorage\.clear/);
assert.doesNotMatch(read('../../screens/settings/SupportScreen.tsx'), /logsSentSuccess/);
assert.doesNotMatch(read('../../screens/settings/DataExportScreen.tsx'), /setSuccess\(true\)/);
assert.match(read('../../hooks/settings/usePrivacy.ts'), /return await exportUserData/);
console.log('Privacy safety regression checks passed');

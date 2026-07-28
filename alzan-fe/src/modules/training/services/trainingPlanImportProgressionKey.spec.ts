import assert from 'node:assert/strict';
import { toImportedProgressionKey } from './trainingPlanImportProgressionKey';

const readableKey = toImportedProgressionKey('running:series_800', 'work');

assert.match(readableKey, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(readableKey, toImportedProgressionKey('running:series_800', 'work'));
assert.notEqual(readableKey, toImportedProgressionKey('running:series_800', 'recovery'));
assert.notEqual(readableKey, toImportedProgressionKey('running:other_family', 'work'));

const existingUuid = '8a9bf5ba-1b43-460b-89d6-672c650cc2c7';
assert.equal(existingUuid, toImportedProgressionKey('strength:lower_body', existingUuid));

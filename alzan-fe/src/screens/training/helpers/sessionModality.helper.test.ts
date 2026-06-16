import assert from 'node:assert/strict';
import {
  shouldRenderModalitySelector,
  resolvePersistedSportSubtype,
  resetSportSubtypeForSportChange,
} from './sessionModality.helper';

type Option = { option_key: string };

const options = (...keys: string[]): Option[] => keys.map(option_key => ({ option_key }));

assert.equal(shouldRenderModalitySelector(options('road', 'indoor_trainer')), true);
assert.equal(shouldRenderModalitySelector([]), false);

assert.equal(resolvePersistedSportSubtype('indoor_trainer', options('road', 'indoor_trainer')), 'indoor_trainer');
assert.equal(resolvePersistedSportSubtype('indoor_trainer', []), null);
assert.equal(resolvePersistedSportSubtype(null, options('road', 'indoor_trainer')), null);

assert.equal(resetSportSubtypeForSportChange('road', options('road', 'indoor_trainer')), null);
assert.equal(resetSportSubtypeForSportChange('road', options('road', 'indoor_trainer'), false), 'road');
assert.equal(resetSportSubtypeForSportChange('road', options('outdoor', 'treadmill')), null);
assert.equal(resetSportSubtypeForSportChange('road', []), null);

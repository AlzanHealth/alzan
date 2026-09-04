import { strict as assert } from 'assert';
import { plainToInstance } from 'class-transformer';
import { CorosHistoryImportResultDto } from './coros-history-import.dto';

const serialized = plainToInstance(
  CorosHistoryImportResultDto,
  {
    filesImported: 1,
    filesSkipped: 2,
    filesFailed: 1,
    errorsByFile: [{ fileName: 'broken.fit', code: 'COROS_FIT_FILE_INVALID' }],
    internalField: 'must not leak',
  },
  { excludeExtraneousValues: true },
);

assert.deepEqual(serialized, {
  filesImported: 1,
  filesSkipped: 2,
  filesFailed: 1,
  errorsByFile: [{ fileName: 'broken.fit', code: 'COROS_FIT_FILE_INVALID' }],
});

console.log('coros-history-import.dto.spec.ts: all assertions passed');

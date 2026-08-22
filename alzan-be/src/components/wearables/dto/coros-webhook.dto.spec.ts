import { strict as assert } from 'assert';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CorosWorkoutPushDto } from './coros-webhook.dto';

void (async () => {
  const valid = plainToInstance(CorosWorkoutPushDto, {
    sportDataList: [{ openId: 'open-id', labelId: 'label-id', fitUrl: 'https://oss.coros.com/a.fit' }],
  });
  assert.equal((await validate(valid)).length, 0);

  const missing = plainToInstance(CorosWorkoutPushDto, {});
  assert.ok((await validate(missing)).length > 0);

  const invalidItem = plainToInstance(CorosWorkoutPushDto, { sportDataList: ['not-an-object'] });
  assert.ok((await validate(invalidItem)).length > 0);

  const excessive = plainToInstance(CorosWorkoutPushDto, {
    sportDataList: Array.from({ length: 101 }, () => ({ openId: 'open-id', labelId: 'label-id' })),
  });
  assert.ok((await validate(excessive)).length > 0);
})().catch((error: unknown) => {
  process.nextTick(() => {
    throw error;
  });
});

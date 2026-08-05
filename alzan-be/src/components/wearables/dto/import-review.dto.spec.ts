import { strict as assert } from 'assert';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TemplateAssociationInputDto } from './import-review.dto';

function run(): void {
  const deterministicEnduranceIds: TemplateAssociationInputDto = plainToInstance(TemplateAssociationInputDto, {
    endurance_template_id: '10000000-0000-0000-0000-000000000106',
    workout_plan_id: '40000000-0000-0000-0000-000000000002',
  });
  const deterministicEnduranceErrors = validateSync(deterministicEnduranceIds);
  assert.equal(
    deterministicEnduranceErrors.length,
    0,
    'PostgreSQL-compatible deterministic endurance UUIDs must be accepted',
  );

  const deterministicStrengthIds: TemplateAssociationInputDto = plainToInstance(TemplateAssociationInputDto, {
    workout_template_id: '10000000-0000-0000-0000-000000000002',
    workout_plan_id: '40000000-0000-0000-0000-000000000002',
  });
  const deterministicStrengthErrors = validateSync(deterministicStrengthIds);
  assert.equal(
    deterministicStrengthErrors.length,
    0,
    'PostgreSQL-compatible deterministic strength UUIDs must be accepted',
  );

  const invalidTemplateId: TemplateAssociationInputDto = plainToInstance(TemplateAssociationInputDto, {
    endurance_template_id: 'dummy',
  });
  const invalidIdErrors = validateSync(invalidTemplateId);
  assert.equal(invalidIdErrors.length, 1, 'Non-UUID template ids must still be rejected');
}

run();

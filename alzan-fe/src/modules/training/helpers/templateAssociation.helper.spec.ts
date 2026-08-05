import assert from 'node:assert/strict';
import { buildTemplateAssociationPayload, isUuid } from './templateAssociation.helper';

assert.equal(isUuid('10000000-0000-0000-0000-000000000106'), true);
assert.deepEqual(
  buildTemplateAssociationPayload({
    sport: 'running',
    templateId: '10000000-0000-0000-0000-000000000106',
  }),
  {
    endurance_template_id: '10000000-0000-0000-0000-000000000106',
    workout_template_id: null,
    workout_plan_id: undefined,
  },
);

assert.equal(isUuid('dummy'), false);
assert.equal(
  buildTemplateAssociationPayload({
    sport: 'running',
    templateId: 'dummy',
  }),
  null,
);

assert.deepEqual(
  buildTemplateAssociationPayload({
    sport: 'strength',
    templateId: '10000000-0000-0000-0000-000000000002',
    workoutPlanId: '40000000-0000-0000-0000-000000000002',
  }),
  {
    endurance_template_id: null,
    workout_template_id: '10000000-0000-0000-0000-000000000002',
    workout_plan_id: '40000000-0000-0000-0000-000000000002',
  },
);

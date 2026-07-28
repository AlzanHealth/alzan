import assert from 'node:assert/strict';
import {
  buildTemplateExpirationPlan,
  isTemplateExpired,
  type TemplateLifecycleRow,
} from '../helpers/templateLifecycle.helper';

const baseTemplate: TemplateLifecycleRow = {
  id: 'template-1',
  user_id: 'user-1',
  recurrence_start_date: '2026-08-01',
  recurrence_end_date: '2026-08-10',
  auto_delete_after_end: true,
};

assert.equal(isTemplateExpired(baseTemplate, '2026-08-10'), false);
assert.equal(isTemplateExpired(baseTemplate, '2026-08-11'), true);
assert.equal(isTemplateExpired({ ...baseTemplate, auto_delete_after_end: false }, '2026-08-11'), false);
assert.equal(isTemplateExpired({ ...baseTemplate, recurrence_end_date: null }, '2026-08-11'), false);

assert.deepEqual(buildTemplateExpirationPlan(baseTemplate, '2026-08-11'), {
  deleteFuturePlansAfter: '2026-08-10',
  preserveHistoryBeforeOrOn: '2026-08-10',
});

assert.equal(buildTemplateExpirationPlan(baseTemplate, '2026-08-10'), null);

import { strict as assert } from 'assert';
import express from 'express';
import axios from 'axios';
import * as bodyParser from 'body-parser';
import { corosJsonMiddleware } from './coros-json.middleware';

async function run(): Promise<void> {
  const app = express();
  app.use('/webhooks/coros/workouts', bodyParser.text({ type: 'application/json', limit: '2mb' }), corosJsonMiddleware);
  app.use(bodyParser.json());
  app.post('/webhooks/coros/workouts', (req, res) => {
    res.json(req.body);
  });
  app.post('/other', (req, res) => {
    res.json(req.body);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    const result = await axios.post(
      `${url}/webhooks/coros/workouts`,
      '{"sportDataList":[{"labelId":418173315956375553,"planWorkoutId":9223372036854775806}]}',
      { headers: { 'content-type': 'application/json' } },
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, {
      sportDataList: [{ labelId: '418173315956375553', planWorkoutId: '9223372036854775806' }],
    });
    const other = await axios.post(`${url}/other`, { value: 42 });
    assert.deepEqual(other.data, { value: 42 });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
}
void run();

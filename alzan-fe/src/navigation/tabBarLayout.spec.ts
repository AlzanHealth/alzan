import assert from 'node:assert/strict';
import {
  getInitialTabBarTopFromScreenBottom,
  getTabBarBottomInset,
  getTabBarTopFromScreenBottom,
} from './tabBarLayoutGeometry';

assert.equal(getTabBarBottomInset(0), 0);
assert.equal(getTabBarBottomInset(34), 34);
assert.equal(getInitialTabBarTopFromScreenBottom(0, 75), 75);
assert.equal(getInitialTabBarTopFromScreenBottom(34, 75), 109);

assert.equal(
  getTabBarTopFromScreenBottom({
    viewportHeight: 844,
    y: 735,
  }),
  109,
);
assert.equal(
  getTabBarTopFromScreenBottom({
    viewportHeight: 812,
    y: 698,
  }),
  114,
);
assert.equal(
  getTabBarTopFromScreenBottom({
    viewportHeight: 844,
    y: 900,
  }),
  0,
);

console.log('tab bar layout tests passed');

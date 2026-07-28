import assert from 'node:assert/strict';
import {
  getTabBarBottomOffset,
  getInitialTabBarTopFromScreenBottom,
  getTabBarBottomInset,
  getTabBarTopFromScreenBottom,
} from './tabBarLayoutGeometry';

assert.equal(getTabBarBottomInset(0), 0);
assert.equal(getTabBarBottomInset(34), 34);
assert.equal(getTabBarBottomOffset(0, 20), 20);
assert.equal(getTabBarBottomOffset(34, 20), 54);
assert.equal(getInitialTabBarTopFromScreenBottom(0, 75, 20), 95);
assert.equal(getInitialTabBarTopFromScreenBottom(34, 75, 20), 129);

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

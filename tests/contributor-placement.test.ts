import assert from 'node:assert/strict';
import test from 'node:test';
import { launcherPlacement } from '../lib/contributors/launcher-placement';
const button = { left: 16, right: 266, top: 738, bottom: 784 };
test('leaves room beside a right-side widget without moving the button', () => {
  assert.deepEqual(launcherPlacement(button, [{left: 400,right: 760,top: 600,bottom: 784}],100),{lift:0,hidden:false});
});
test('clears the actual tall portrait player rather than a nominal dock height', () => {
  const result=launcherPlacement(button,[{left:12,right:252,top:350,bottom:788}],100);
  assert.equal(button.bottom-result.lift,338);assert.equal(result.hidden,false);
});
test('clears stacked and dragged widgets regardless of order', () => {
  const obstacles=[{left:12,right:252,top:600,bottom:788},{left:16,right:400,top:510,bottom:590}];
  const result=launcherPlacement(button,obstacles,100);
  assert.deepEqual(result,launcherPlacement(button,[...obstacles].reverse(),100));assert.equal(button.bottom-result.lift,498);
});
test('temporarily hides the launcher when no unobstructed space remains', () => {
  assert.equal(launcherPlacement(button,[{left:0,right:800,top:100,bottom:800}],110).hidden,true);
});
test('reclaims the original position when widgets are closed', () => {
  assert.deepEqual(launcherPlacement(button,[],100),{lift:0,hidden:false});
});

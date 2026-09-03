/** Self-check for the theme-colour alpha helpers: `npm run check:termcolor`. */
import assert from 'node:assert';
import { withAlpha, alphaOf } from './termColor';

// the two formats theme files are documented to use
assert.strictEqual(withAlpha('#282c34', 0.5), 'rgba(40, 44, 52, 0.5)');
assert.strictEqual(withAlpha('rgba(40, 44, 52, 0.78)', 0.5), 'rgba(40, 44, 52, 0.5)');
// alpha is REPLACED, not multiplied — 0.78 in, 0.5 out, not 0.39
assert.strictEqual(withAlpha('rgba(40, 44, 52, 0.78)', 1), 'rgba(40, 44, 52, 1)');
// tolerated variants: 3-digit hex, uppercase, rgb() with no alpha, tight spacing
assert.strictEqual(withAlpha('#abc', 0.4), 'rgba(170, 187, 204, 0.4)');
assert.strictEqual(withAlpha('#FF0080', 1), 'rgba(255, 0, 128, 1)');
assert.strictEqual(withAlpha('rgb(1,2,3)', 0.9), 'rgba(1, 2, 3, 0.9)');
// unparseable → returned untouched, never a guessed colour
assert.strictEqual(withAlpha('rebeccapurple', 0.5), 'rebeccapurple');
assert.strictEqual(withAlpha('#xyzxyz', 0.5), '#xyzxyz');
assert.strictEqual(withAlpha('', 0.5), '');

// alphaOf seeds the slider from whatever the theme already declares
assert.strictEqual(alphaOf('rgba(40, 44, 52, 0.78)'), 0.78);
assert.strictEqual(alphaOf('#282c34'), 1);
assert.strictEqual(alphaOf('rgb(1, 2, 3)'), 1);
assert.strictEqual(alphaOf('rebeccapurple'), 1);

console.log('termColor: ok');

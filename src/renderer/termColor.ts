/**
 * Alpha surgery on terminal theme colours.
 *
 * A connection's `terminalOpacity` OVERRIDES whatever alpha its theme file carries, so the
 * theme decides the hue and the connection decides how see-through it is. That means pulling
 * the RGB back out of the theme value — `color-mix(… , transparent)` won't do, because it
 * multiplies the existing alpha instead of replacing it.
 *
 * Theme files document exactly two formats (see THEME_CONF_HEADER in main/index.ts):
 * `#rrggbb` or `rgba(r, g, b, a)`. Anything else is handed back untouched rather than
 * guessed at — a wrong colour here is a wrong terminal background on every redraw.
 */

/** `color` with its alpha replaced by `alpha`. Unparseable input is returned as-is. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const nums = color.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return color;
  return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
}

/** The alpha `color` already carries — 1 when it has none. Used to seed the slider. */
export function alphaOf(color: string): number {
  const nums = color.match(/[\d.]+/g);
  if (color.startsWith('#') || !nums || nums.length < 4) return 1;
  const a = parseFloat(nums[3]);
  return Number.isFinite(a) ? a : 1;
}

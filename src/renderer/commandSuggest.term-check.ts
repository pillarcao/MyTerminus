/**
 * Drives Suggester against a real xterm parser (headless) to verify the on-screen behaviour:
 * the ghost text, the DECSC/DECRC round-trip and the CSI K erase timing.
 * Run with: npm run check:suggest
 */
import assert from 'node:assert';
import { Terminal } from '@xterm/headless';
import { Suggester, remember } from './commandSuggest';

const PROMPT = 'user@web1:~$ ';

const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
const suggest = new Suggester(term as any, 'web1');

/** What the shell sends back, exactly as Terminal.tsx routes it. */
const fromShell = (data: string) =>
  new Promise<void>(resolve => {
    suggest.onOutput();
    term.write(data, () => setTimeout(resolve, 90)); // > the 60ms settle timer
  });

/** What the user types, exactly as sendInput() routes it, with local echo. */
const type = async (key: string) => {
  const sent = suggest.onKey(key);
  await fromShell(sent); // shells echo printable input back
  return sent;
};

const row = (n = 0) => term.buffer.active.getLine(n)!.translateToString(true);
const cell = (x: number) => {
  const c = term.buffer.active.getLine(0)!.getCell(x)!;
  return { chars: c.getChars(), fg: c.getFgColor(), mode: c.isFgPalette() };
};

async function main() {
  remember('git status');
  remember('git log --oneline -20');

  // 1. prompt arrives, nothing typed yet → no suggestion
  await fromShell(PROMPT);
  assert.strictEqual(row(), PROMPT, 'prompt should be intact');

  // 2. one char is too little to guess on
  await type('g');
  assert.strictEqual(row(), PROMPT + 'g');

  // 3. two chars → ghost text appears, cursor stays put, real input untouched
  await type('i');
  assert.strictEqual(row(), PROMPT + 'git log --oneline -20', 'ghost tail should be drawn');
  assert.strictEqual(term.buffer.active.cursorX, PROMPT.length + 2, 'cursor must not move');
  assert.strictEqual(cell(PROMPT.length + 2).chars, 't', 'ghost starts at the cursor');
  assert.strictEqual(cell(PROMPT.length + 2).fg, 8, 'ghost is drawn dim (bright black)');
  assert.strictEqual(cell(PROMPT.length).fg, -1, 'real input keeps the default colour');

  // 4. DECRC restored the SGR state, so the echoed char is not dim like the ghost was
  await type('t');
  assert.strictEqual(cell(PROMPT.length + 2).chars, 't');
  assert.strictEqual(cell(PROMPT.length + 2).fg, -1, 'ghost colour must not bleed into real input');

  // 5. switching to a *shorter* suggestion: the long tail must be fully erased, no leftovers
  await type(' ');
  assert.strictEqual(row(), PROMPT + 'git log --oneline -20');
  await type('s');
  assert.strictEqual(row(), PROMPT + 'git status', 'stale 21-char tail must be gone');

  // 6. → accepts: the tail is what gets sent to the shell, and the ghost is gone before echo
  const sent = await type('\x1b[C');
  assert.strictEqual(sent, 'tatus', 'right arrow sends the suggested tail');
  assert.strictEqual(row(), PROMPT + 'git status');
  assert.strictEqual(term.buffer.active.cursorX, PROMPT.length + 10, 'cursor at end of accepted text');

  // 6. Enter is passed through untouched and records the command
  assert.strictEqual(suggest.onKey('\r'), '\r');

  // 7. unsolicited shell output while a ghost is on screen must not eat real text
  await fromShell('\r\n' + PROMPT + 'gi');
  assert.ok(row(1).startsWith(PROMPT + 'git status'), 'ghost re-offered on the new line');
  await fromShell('\r\nBroadcast message: reboot\r\n');
  assert.strictEqual(row(1), PROMPT + 'gi', 'ghost erased, typed text preserved');
  assert.strictEqual(row(2), 'Broadcast message: reboot');

  // 9. wide (CJK) glyphs: columns ≠ string indices. With the cursor left of a real character,
  //    a naive index-based split reports "end of line" and CSI K then eats that character.
  await fromShell('\x1b[2J\x1b[H' + PROMPT + 'echo 你好x\x1b[1D'); // cursor sits on the `x`
  assert.strictEqual(row(), PROMPT + 'echo 你好x', 'mid-line cursor after CJK → no ghost, nothing eaten');

  // 10. cursor genuinely at end of a line containing CJK → suggestion still works
  remember('echo 你好 world');
  await fromShell('\r\n' + PROMPT + 'echo 你好 w');
  assert.strictEqual(row(1), PROMPT + 'echo 你好 world', 'suggestion offered after wide glyphs');
  assert.strictEqual(suggest.onKey('\x1b[C'), 'orld');

  // 11. alternate screen (vim, top, less) → never suggest
  await fromShell('\x1b[?1049h\x1b[H' + PROMPT + 'git s');
  assert.strictEqual(
    term.buffer.active.getLine(term.buffer.active.cursorY)!.translateToString(true),
    PROMPT + 'git s',
    'no suggestion inside the alternate screen',
  );

  console.log('commandSuggest terminal behaviour: ok');
  suggest.dispose();
}

main();

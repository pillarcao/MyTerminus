/**
 * Inline command autosuggestion — fish shell / zsh-autosuggestions style.
 *
 * The remote shell knows nothing about this. The suggested tail is drawn locally into the
 * xterm buffer as dim text right of the cursor, wrapped in DECSC/DECRC (ESC 7 / ESC 8) so
 * the shell's cursor position *and* SGR state survive, and erased with EL (CSI K) before
 * anything else touches the line. Accept with →, End or Ctrl+E: the tail is then sent to
 * the shell as if it had been typed.
 *
 * Everything is guarded on "we can see a prompt and the cursor is at end of line", so vim,
 * top, less and password prompts get no suggestion at all.
 */
import type { IBufferLine, Terminal as XTerm } from '@xterm/xterm';

const HISTORY_KEY = 'ssh.cmdHistory.v1';
const MAX_HISTORY = 500;

/** Seeds so suggestions work on a fresh install, before any history exists. */
const SEED = [
  'ls -la', 'cd ..', 'df -h', 'du -sh *', 'free -m', 'ps aux | grep ', 'top', 'htop',
  'tail -f /var/log/syslog', 'journalctl -xe', 'systemctl status ', 'systemctl restart ',
  'docker ps -a', 'docker logs -f ', 'docker compose up -d', 'kubectl get pods',
  'git status', 'git pull', 'git log --oneline -20', 'netstat -tulpn', 'ss -tulpn',
  'chmod +x ', 'chown -R ', 'grep -rn ', 'find . -name ', 'tar -czvf ', 'nvidia-smi',
];

/** Never persist a line that carries a credential on it. */
const SECRET_CMD = /--password|passwd\s|token=|apikey|secret=/i;

/** Commands typed here (persisted, newest first) — these win over every seed. */
let history: string[] = load();
/** Each host's own shell history, session-only, keyed by connectionId. */
const seedsByHost = new Map<string, string[]>();
const MAX_SEEDS = 2000;

function load(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/**
 * Turn raw `~/.bash_history` + `~/.zsh_history` content into newest-first commands.
 * zsh's EXTENDED_HISTORY prefixes each entry with `: <epoch>:<elapsed>;`.
 */
export function parseHistoryFile(raw: string): string[] {
  const cmds = raw
    .split('\n')
    .map(l => l.replace(/^:\s*\d+:\d+;/, '').trim())
    .filter(l => l.length > 1 && !l.startsWith('#') && !l.endsWith('\\') && !SECRET_CMD.test(l));
  return [...new Set(cmds.reverse())]; // files are oldest-first
}

/** Register a host's own shell history as suggestion seeds. */
export function seedHistory(connectionId: string, raw: string): void {
  const cmds = parseHistoryFile(raw).slice(0, MAX_SEEDS);
  if (cmds.length) seedsByHost.set(connectionId, cmds);
}

/**
 * Suggestion sources for a host, most relevant first: what you typed in this app, then this
 * host's own shell history, then other hosts' (that long docker line is worth reusing), then
 * the built-ins. Layered rather than filtered — a cross-host hit still beats no suggestion.
 */
export function suggestionLists(connectionId: string): string[][] {
  const others: string[][] = [];
  for (const [id, cmds] of seedsByHost) {
    if (id !== connectionId) others.push(cmds);
  }
  return [history, seedsByHost.get(connectionId) ?? [], ...others, SEED];
}

/** Record an executed command; most recent wins the next prefix match. */
export function remember(cmd: string): void {
  const c = cmd.trim();
  if (c.length < 2 || SECRET_CMD.test(c)) return;
  history = [c, ...history.filter(h => h !== c)].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* private mode / quota — suggestions still work for this session */ }
}

/**
 * Extract what the user has typed, given the cursor row split at the cursor. Returns null when
 * this is not a prompt we can reason about (no prompt marker, or the cursor is mid-line).
 * Callers must split by *column*, not by string index — a CJK glyph occupies two columns.
 */
export function parseInput(before: string, after: string): string | null {
  if (after.trim()) return null; // real text to the right — cursor is mid-line
  const m = /^.*[$#%>❯]\s/.exec(before); // greedy: the *last* prompt marker wins
  if (!m) return null;
  if (/pass|secret|phrase|token/i.test(m[0])) return null; // "Password:"-ish prompt
  return before.slice(m[0].length);
}

/**
 * The part of a remembered command that would be appended to `input`.
 * Lists are searched in order, so locally typed commands beat seeded ones.
 */
export function pickSuggestion(input: string, lists: string[][]): string | null {
  if (input.length < 2) return null;
  for (const list of lists) {
    const hit = list.find(h => h.length > input.length && h.startsWith(input));
    if (hit) return hit.slice(input.length);
  }
  return null;
}

// →, End, Ctrl+E — both normal and application cursor mode (DECCKM, set by most shells).
const ACCEPT = new Set(['\x1b[C', '\x1bOC', '\x1b[F', '\x1bOF', '\x05']);

export class Suggester {
  private ghost = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private term: XTerm, private connectionId: string) {}

  /** Run every keystroke through this before it reaches the shell; returns what to send. */
  onKey(data: string): string {
    const ghost = this.ghost;
    this.clear();
    if (data === '\r') remember(this.lineInput() ?? '');
    return ghost && ACCEPT.has(data) ? ghost : data;
  }

  /** Call before writing shell output; redraws the suggestion once the line settles. */
  onOutput(): void {
    this.clear();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.draw(), 60);
  }

  dispose(): void {
    clearTimeout(this.timer);
  }

  /** Whole typed line, ignoring the cursor column — used when Enter is pressed. */
  private lineInput(): string | null {
    const line = this.cursorLine();
    return line ? parseInput(line.translateToString(true), '') : null;
  }

  private cursorLine(): IBufferLine | null {
    const buf = this.term.buffer.active;
    if (buf.type !== 'normal') return null; // alternate screen: vim, top, less…
    const line = buf.getLine(buf.baseY + buf.cursorY);
    return !line || line.isWrapped ? null : line;
  }

  private draw(): void {
    const line = this.cursorLine();
    if (!line) return;
    const { cursorX } = this.term.buffer.active;
    // Let xterm do the column→character mapping, so wide (CJK) glyphs stay aligned.
    const input = parseInput(line.translateToString(false, 0, cursorX), line.translateToString(true, cursorX));
    if (input === null) return;
    const tail = pickSuggestion(input, suggestionLists(this.connectionId));
    // Width, not length: assume the worst (2 columns) for anything non-ASCII.
    const width = tail ? (/^[\x20-\x7e]*$/.test(tail) ? tail.length : tail.length * 2) : 0;
    if (!tail || cursorX + width >= this.term.cols) return; // would wrap: skip
    this.term.write(`\x1b7\x1b[90m${tail}\x1b8`);
    this.ghost = tail;
  }

  private clear(): void {
    if (!this.ghost) return;
    this.term.write('\x1b[K');
    this.ghost = '';
  }
}

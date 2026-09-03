/** Self-check for the suggestion parser: `npm run check:suggest`. */
import assert from 'node:assert';
import { parseInput, parseHistoryFile, pickSuggestion, seedHistory, suggestionLists } from './commandSuggest';

// prompt detected, cursor at end of typed text
assert.strictEqual(parseInput('root@web1:~# ls -l', ''), 'ls -l');
assert.strictEqual(parseInput('user@mac ~ % git st', ''), 'git st');
assert.strictEqual(parseInput('❯ docker ps ', ''), 'docker ps ');
// trailing spaces right of the cursor are fine, real text is not
assert.strictEqual(parseInput('$ git ', '   '), 'git ');
assert.strictEqual(parseInput('$ git ', 'log'), null);
// no prompt marker, or a password prompt → never suggest
assert.strictEqual(parseInput('Enter file in which to save', ''), null);
assert.strictEqual(parseInput('[sudo] password for bob: ', ''), null);

const hist = ['git log --oneline', 'git status', 'ls -la'];
assert.strictEqual(pickSuggestion('git ', [hist]), 'log --oneline'); // most recent wins
assert.strictEqual(pickSuggestion('ls', [hist]), ' -la');
assert.strictEqual(pickSuggestion('g', [hist]), null); // too short to guess
assert.strictEqual(pickSuggestion('ls -la', [hist]), null); // exact match, nothing to add
assert.strictEqual(pickSuggestion('nope', [hist]), null);
// earlier lists win: locally typed history beats a seeded remote history
assert.strictEqual(pickSuggestion('git s', [['git switch main'], hist]), 'witch main');

// remote history: newest first, zsh timestamps stripped, junk and secrets dropped
assert.deepStrictEqual(
  parseHistoryFile('ls -la\n: 1699999999:0;cd /var/log\n\nx\n#comment\nfoo --password hunter2\nls -la\n'),
  ['ls -la', 'cd /var/log'], // the trailing `ls -la` is the most recent, the dup is dropped
);
assert.deepStrictEqual(parseHistoryFile(''), []);

// layered, not filtered: this host's history first, other hosts' still reachable
seedHistory('web', 'systemctl restart nginx\n');
seedHistory('db', 'systemctl restart postgres\ndocker run --rm -it alpine sh\n');
assert.strictEqual(pickSuggestion('systemctl restart ', suggestionLists('web')), 'nginx');
assert.strictEqual(pickSuggestion('systemctl restart ', suggestionLists('db')), 'postgres');
assert.strictEqual(pickSuggestion('docker run ', suggestionLists('web')), '--rm -it alpine sh');
// a host with no history of its own still gets the others' plus the built-ins
assert.strictEqual(pickSuggestion('docker c', suggestionLists('fresh')), 'ompose up -d');

console.log('commandSuggest: ok');

import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const url = 'https://github.com/teramoby/ai.speedle.io/tree/main/skills/speedle-policy-modeler';
const app = read('app.js');

for (const locale of ['', 'zh/', 'ja/', 'ko/', 'es/']) {
  test(`${locale || 'en/'} install cards lead with copyable prompts and hide manual commands`, () => {
    const html = read(`${locale}index.html`);
    const cards = [...html.matchAll(/<figure class="config-card skill-install">([\s\S]*?)<\/figure>/g)];
    assert.equal(cards.length, 2);
    cards.forEach(([ , card], index) => {
      const [primary, manual] = card.split('<details class="manual-install">');
      assert.ok(manual, 'manual installation is collapsed by default');
      assert.match(manual, /<summary>[^<]+<\/summary>/);
      const prompt = primary.match(/<pre class="install-prompt"[^>]*><code>([^<]+)<span class="install-url">([^<]+)<\/span><\/code><\/pre>/);
      assert.ok(prompt, 'URL has its own wrapping span');
      const promptText = prompt[1] + prompt[2];
      assert.ok(promptText.endsWith(url));
      assert.equal(promptText, promptText.trim(), 'no leading or trailing preformatted whitespace');
      assert.equal(promptText.split('\n').length, 2, 'the full URL has its own unindented line');
      assert.equal(promptText.split('\n')[1], url);
      assert.match(primary, /<div class="install-body">/);
      assert.match(primary, /<p class="mode-label">[^<]+<\/p>/);
      assert.match(primary, /<div class="install-usage">\s*<p class="mode-label">[^<]+<\/p>\s*<div class="install-copy">/);
      const blocks = [...card.matchAll(/<div class="install-copy">([\s\S]*?)<\/div>/g)];
      assert.equal(blocks.length, 3, 'prompt, usage and manual commands each have their own copy control');
      blocks.forEach(([, block]) => {
        assert.match(block, /<button class="command-copy-button" type="button" aria-label="[^"]+" data-success="[^"]+" data-failure="[^"]+" hidden>/);
        assert.match(block, /<svg class="copy-icon"[^>]+aria-hidden="true"/);
        assert.match(block, /<svg class="copied-icon"[^>]+aria-hidden="true"/);
        assert.match(block, /<span class="copy-tooltip" aria-hidden="true">[^<]+<\/span>/);
        assert.match(block, /<span class="command-copy-status" role="status" aria-live="polite"><\/span>/);
        const code = block.match(/<code>([\s\S]*?)<\/code>/)?.[1]?.replace(/<\/?span(?: class="install-url")?>/g, '');
        assert.ok(code);
        assert.equal(code, code.trim(), 'no leading or trailing code whitespace');
      });
      const invocation = `${index === 0 ? '/' : '$'}speedle-policy-modeler ./employee-handbook.md`;
      assert.ok(primary.indexOf(invocation) > primary.indexOf(prompt[1]));
      assert.ok(!primary.includes('git clone') && !primary.includes('claude plugin'));
      assert.match(primary, /Python 3/);
      if (index === 0) {
        for (const command of ['claude plugin marketplace add teramoby/ai.speedle.io', 'claude plugin install speedle@speedle', '/plugin configure speedle@speedle', '/speedle:speedle-policy-modeler']) assert.ok(manual.includes(command));
        assert.match(manual, /ADS/);
      } else {
        assert.match(manual, /git clone --depth 1/);
        assert.match(manual, /~\/.agents\/skills/);
      }
    });
  });
}

function setup(clipboard, legacyResult) {
  const handlers = [];
  const timers = new Map();
  const copies = [];
  const calls = [];
  const texts = [
    `Install this skill for me:\n${url}`,
    '/speedle-policy-modeler ./employee-handbook.md',
    'claude plugin marketplace add teramoby/ai.speedle.io\nclaude plugin install speedle@speedle',
    '$speedle-policy-modeler ./employee-handbook.md',
    'git clone --depth 1 https://github.com/teramoby/ai.speedle.io.git\nmkdir -p ~/.agents/skills'
  ];
  const cards = texts.map(text => {
    const button = {
      hidden: true, dataset: { success: 'Copied!', failure: 'Copy manually' },
      getAttribute: () => 'Copy', addEventListener: (_, handler) => handlers.push(handler)
    };
    const status = { textContent: '' };
    const tooltip = { textContent: 'Copy' };
    const elements = { '.command-copy-button': button, 'pre code': { textContent: text }, '.command-copy-status': status, '.copy-tooltip': tooltip };
    return { button, status, tooltip, querySelector: selector => elements[selector] };
  });
  let input;
  const selection = {
    rangeCount: 1,
    getRangeAt: () => ({ cloneRange: () => 'original range' }),
    removeAllRanges: () => calls.push('clear selection'),
    addRange: range => calls.push(range)
  };
  const document = {
    querySelectorAll: selector => selector === '.install-copy' ? cards : [],
    querySelector: () => ({ querySelectorAll: () => [] }),
    activeElement: { isConnected: true, focus: () => calls.push('restore focus') },
    body: { append: element => { input = element; calls.push('append input'); } },
    createElement: tag => {
      assert.equal(tag, 'textarea');
      return {
        setAttribute: (key, value) => calls.push([key, value]),
        focus: () => calls.push('input focus'), select: () => calls.push('select input'),
        setSelectionRange: (start, end) => calls.push([start, end]),
        remove: () => calls.push('remove input')
      };
    },
    createRange: () => ({ selectNodeContents: code => calls.push(['select code', code.textContent]) })
  };
  if (legacyResult !== undefined) document.execCommand = command => {
    assert.equal(command, 'copy');
    copies.push(input.value);
    if (legacyResult instanceof Error) throw legacyResult;
    return legacyResult;
  };
  let timerId = 0;
  runInNewContext(app, {
    document, window: { getSelection: () => selection }, navigator: { clipboard },
    clearTimeout: id => timers.delete(id),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; }
  });
  return { cards, handlers, timers, copies, calls };
}

test('each control copies exact text, announces success and resets its icon and tooltip after 2.2 seconds', async () => {
  const copied = [];
  const { cards, handlers, timers } = setup({ writeText: async text => copied.push(text) });
  for (const [index, handler] of handlers.entries()) {
    const { button, status, tooltip } = cards[index];
    assert.equal(button.hidden, false);
    await handler();
    assert.equal(button.dataset.state, 'copied');
    assert.equal(tooltip.textContent, 'Copied!');
    assert.equal(status.textContent, 'Copied!');
  }
  assert.deepEqual(copied, cards.map(card => card.querySelector('pre code').textContent));
  for (const { callback, delay } of timers.values()) {
    assert.equal(delay, 2200);
    callback();
  }
  cards.forEach(({ button, tooltip }) => {
    assert.equal(button.dataset.state, undefined);
    assert.equal(tooltip.textContent, 'Copy');
  });
});

for (const clipboard of [undefined, { writeText: async () => { throw new Error('Permission denied'); } }]) {
  test(`clipboard ${clipboard ? 'rejection' : 'unavailable'} uses legacy copy and restores focus and selection`, async () => {
    const { cards, handlers, copies, calls } = setup(clipboard, true);
    await handlers[0]();
    assert.deepEqual(copies, [cards[0].querySelector('pre code').textContent]);
    assert.equal(cards[0].button.dataset.state, 'copied');
    assert.ok(calls.includes('remove input'));
    assert.ok(calls.includes('restore focus'));
    assert.ok(calls.includes('original range'));
  });
}

for (const legacyResult of [undefined, false, new Error('Legacy failure')]) {
  test(`failed copy (${String(legacyResult)}) shows localized error, selects code and permits retry`, async () => {
    const { cards, handlers, timers, calls } = setup(undefined, legacyResult);
    await handlers[0]();
    assert.equal(cards[0].button.dataset.state, 'error');
    assert.equal(cards[0].status.textContent, 'Copy manually');
    assert.equal(cards[0].tooltip.textContent, 'Copy manually');
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'select code'));
    if (legacyResult !== undefined) assert.ok(calls.includes('remove input'));
    await handlers[0]();
    assert.equal(timers.size, 1, 'repeated clicks replace the previous reset timer');
    [...timers.values()][0].callback();
    assert.equal(cards[0].button.dataset.state, undefined);
    assert.equal(cards[0].tooltip.textContent, 'Copy');
  });
}

test('pending copy ignores duplicate requests, clears feedback and replaces the previous reset timer', async () => {
  let finish;
  let count = 0;
  const { cards, handlers, timers } = setup({ writeText: () => { count++; return new Promise(resolve => { finish = resolve; }); } });
  cards[0].status.textContent = 'Old feedback';
  cards[0].button.dataset.state = 'copied';
  const pending = handlers[0]();
  await handlers[0]();
  assert.equal(count, 1);
  assert.equal(cards[0].status.textContent, '');
  assert.equal(cards[0].button.dataset.state, undefined);
  finish();
  await pending;
  assert.equal(timers.size, 1);
  const repeat = handlers[0]();
  assert.equal(timers.size, 0);
  finish();
  await repeat;
  assert.equal(count, 2);
  assert.equal(timers.size, 1);
});

test('complete skill directory installs independently in both documented locations', () => {
  const home = mkdtempSync(join(tmpdir(), 'speedle-install-'));
  try {
    const readme = read('skills/speedle-policy-modeler/README.md');
    for (const agent of ['.claude', '.agents']) {
      assert.ok(readme.includes(`~/${agent}/skills/speedle-policy-modeler/`));
      const destination = join(home, agent, 'skills/speedle-policy-modeler');
      cpSync(new URL('skills/speedle-policy-modeler', root), destination, { recursive: true });
      for (const file of ['SKILL.md', 'scripts/validate-model.sh', 'scripts/run-cases.py', 'templates/test-cases.json', 'examples/en/policies.spdl']) assert.ok(existsSync(join(destination, file)), file);
      // Resolve the skill's local Markdown links after copying, without the repository.
      const skill = readFileSync(join(destination, 'SKILL.md'), 'utf8');
      for (const [, target] of skill.matchAll(/\]\(([^)]+)\)/g)) {
        if (!target.includes('://')) assert.ok(existsSync(join(destination, target)), target);
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

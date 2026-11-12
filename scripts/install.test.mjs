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
      const prompt = primary.match(/<pre class="install-prompt"[^>]*><code>([^<]+)<\/code><\/pre>/)?.[1];
      assert.ok(prompt?.endsWith(url));
      assert.ok(!prompt.includes('\n'), 'prompt is one line');
      assert.match(primary, /<button class="copy-prompt" type="button" data-success="[^"]+" data-failure="[^"]+" hidden>[^<]+<\/button>/);
      assert.match(primary, /role="status"/);
      const invocation = `${index === 0 ? '/' : '$'}speedle-policy-modeler ./employee-handbook.md`;
      assert.ok(primary.indexOf(invocation) > primary.indexOf(prompt));
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

function setup(clipboard) {
  const handlers = [];
  const cards = ['first prompt', 'second prompt'].map(text => {
    const button = { hidden: true, disabled: false, dataset: { success: 'Copied', failure: 'Copy manually' }, addEventListener: (_, handler) => handlers.push(handler) };
    const status = { textContent: '' };
    const elements = { '.copy-prompt': button, '.install-prompt code': { textContent: text }, '.copy-status': status };
    return { button, status, querySelector: selector => elements[selector] };
  });
  runInNewContext(app, {
    document: { querySelectorAll: selector => selector === '.skill-install' ? cards : [], querySelector: () => ({ querySelectorAll: () => [] }) },
    window: {}, navigator: { clipboard }
  });
  return { cards, handlers };
}

test('copy buttons copy only their own prompt, announce success and permit repeat use', async () => {
  const copied = [];
  const { cards, handlers } = setup({ writeText: async text => copied.push(text) });
  for (const [index, handler] of handlers.entries()) {
    assert.equal(cards[index].button.hidden, false);
    await handler();
    assert.equal(cards[index].status.textContent, 'Copied');
    assert.equal(cards[index].button.disabled, false);
  }
  await handlers[0]();
  assert.deepEqual(copied, ['first prompt', 'second prompt', 'first prompt']);
});

for (const clipboard of [undefined, { writeText: async () => { throw new Error('Permission denied'); } }]) {
  test(`clipboard ${clipboard ? 'rejection' : 'unavailable'} announces manual fallback and allows retry`, async () => {
    const { cards, handlers } = setup(clipboard);
    await handlers[0]();
    assert.equal(cards[0].status.textContent, 'Copy manually');
    assert.equal(cards[0].button.disabled, false);
  });
}

test('pending copy prevents duplicate requests and clears previous feedback', async () => {
  let finish;
  const { cards, handlers } = setup({ writeText: () => new Promise(resolve => { finish = resolve; }) });
  cards[0].status.textContent = 'Old feedback';
  const pending = handlers[0]();
  assert.equal(cards[0].button.disabled, true);
  assert.equal(cards[0].status.textContent, '');
  finish();
  await pending;
  assert.equal(cards[0].button.disabled, false);
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

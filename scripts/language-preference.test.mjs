import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function run({cookie = '', pathname = '/', hostname = 'ai.speedle.io', protocol = 'https:', blocked = false, lang = 'en'} = {}) {
  const writes = [], redirects = [], listeners = {}, removed = [];
  const jar = new Map(cookie.split(';').filter(Boolean).map(part => {
    const [name, ...value] = part.trim().split('=');
    return [name, {value: value.join('=')}];
  }));
  function element(tag) {
    return {tagName: tag, children: [], handlers: {}, append(...nodes) {this.children.push(...nodes);}, addEventListener(name, fn) {this.handlers[name] = fn;}};
  }
  const panel = element('div');
  const document = {
    documentElement: {lang},
    querySelectorAll: selector => selector === '.languages-panel' ? [panel] : [],
    querySelector: () => ({querySelectorAll: () => []}),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    createElement: element,
    get cookie() { if (blocked) throw new Error('blocked'); return [...jar].map(([name, entry]) => `${name}=${entry.value}`).join('; '); },
    set cookie(value) {
      if (blocked) throw new Error('blocked');
      writes.push(value);
      const [pair, ...attributes] = value.split(';').map(part => part.trim());
      const [name, ...parts] = pair.split('=');
      const maxAgeAttribute = attributes.find(attribute => attribute.startsWith('Max-Age='));
      const maxAge = maxAgeAttribute ? Number(maxAgeAttribute.slice(8)) : undefined;
      if (maxAge === 0) jar.delete(name);
      else jar.set(name, {value: parts.join('='), maxAge, attributes});
    },
  };
  vm.runInNewContext(source, {
    document,
    window: {addEventListener() {}, localStorage: {removeItem: key => removed.push(['local', key])}, sessionStorage: {removeItem: key => removed.push(['session', key])}},
    location: {hostname, protocol, pathname, search: '?from=products', hash: '#overview', replace: value => redirects.push(value)},
  });
  const controls = panel.children[0];
  const input = controls.children[0].children[0];
  const clear = controls.children[1];
  function select(locale, type = 'click', button = 0) {
    listeners[type]?.({type, button, target: {closest: () => ({getAttribute: () => locale})}});
  }
  function remember(value) {input.checked = value; input.handlers.change();}
  return {writes, redirects, select, jar, input, clear: () => clear.handlers.click(), remember, removed, panel};
}

for (const [locale, prefix] of [['ja', 'ja'], ['ko', 'ko'], ['es', 'es'], ['zh-CN', 'zh']]) {
  test(`shared ${locale} choice applies on neutral entry and keeps query/fragment`, () => {
    const page = run({cookie: `unrelated=keep; speedle_locale=${locale}`});
    assert.deepEqual(page.redirects, [`/${prefix}/?from=products#overview`]);
    assert.equal(page.jar.get('speedle_locale').maxAge, undefined, 'legacy preference is session-only without opt-in');
    assert.equal(page.input.checked, false);
  });
}

test('all five explicit selections default to session cookies without Max-Age or Expires', () => {
  for (const locale of ['en', 'ja', 'ko', 'es', 'zh-CN']) {
    const page = run({pathname: '/ja/'});
    page.select(locale);
    const saved = page.jar.get('speedle_locale');
    assert.equal(saved.value, locale);
    assert.equal(saved.maxAge, undefined);
    assert.ok(!page.writes.find(write => write.startsWith('speedle_locale=')).includes('Expires='));
    assert.deepEqual(saved.attributes, ['Domain=speedle.io', 'Path=/', 'SameSite=Lax', 'Secure']);
    assert.equal(page.jar.has('speedle_locale_remember'), false);
    assert.deepEqual(page.redirects, []);
  }
});

test('checking the remember option explicitly creates one-year locale and consent cookies', () => {
  const page = run({pathname: '/ja/', lang: 'ja'});
  assert.equal(page.input.checked, false);
  page.remember(true);
  assert.equal(page.input.checked, true);
  assert.equal(page.jar.get('speedle_locale_remember').value, '1');
  assert.equal(page.jar.get('speedle_locale_remember').maxAge, 31536000);
  assert.equal(page.jar.get('speedle_locale').value, 'ja');
  assert.equal(page.jar.get('speedle_locale').maxAge, 31536000);
  page.select('en');
  assert.equal(page.jar.get('speedle_locale').value, 'en');
  assert.equal(page.jar.get('speedle_locale').maxAge, 31536000);
});

test('unchecking removes consent, demotes the visible language and clears legacy storage', () => {
  const page = run({pathname: '/ja/', lang: 'ja', cookie: 'speedle_locale=ja; speedle_locale_remember=1'});
  assert.equal(page.input.checked, true);
  page.remember(false);
  assert.equal(page.jar.has('speedle_locale_remember'), false);
  assert.equal(page.jar.get('speedle_locale').value, 'ja');
  assert.equal(page.jar.get('speedle_locale').maxAge, undefined);
  assert.ok(page.removed.some(([store, key]) => store === 'local' && key === 'speedle-cloud.locale'));
  assert.equal(page.input.checked, false);
});

test('clear deletes both cookies and local/session copies without changing the current page', () => {
  const page = run({pathname: '/ja/', lang: 'ja', cookie: 'speedle_locale=ja; speedle_locale_remember=1; unrelated=keep'});
  page.clear();
  assert.equal(page.jar.has('speedle_locale'), false);
  assert.equal(page.jar.has('speedle_locale_remember'), false);
  assert.equal(page.jar.get('unrelated').value, 'keep');
  assert.equal(page.input.checked, false);
  assert.ok(page.removed.some(([store]) => store === 'session'));
  assert.ok(page.removed.some(([store]) => store === 'local'));
  assert.deepEqual(page.redirects, []);
});

test('stale checked UI cannot regrant consent withdrawn on another site', () => {
  const page = run({pathname: '/ja/', lang: 'ja', cookie: 'speedle_locale=ja; speedle_locale_remember=1'});
  page.jar.delete('speedle_locale_remember');
  assert.equal(page.input.checked, true, 'simulates a tab that has not regained focus');
  page.select('es');
  assert.equal(page.jar.has('speedle_locale_remember'), false);
  assert.equal(page.jar.get('speedle_locale').value, 'es');
  assert.equal(page.jar.get('speedle_locale').maxAge, undefined);
  assert.equal(page.input.checked, false);
});

test('only a valid explicit marker preserves persistence; ordinary page render grants nothing', () => {
  for (const marker of ['', '0', 'true', 'invalid']) {
    const page = run({pathname: '/ja/', cookie: `speedle_locale=ja; speedle_locale_remember=${marker}`});
    assert.equal(page.input.checked, false);
    assert.equal(page.jar.has('speedle_locale_remember'), false);
    assert.equal(page.jar.get('speedle_locale').maxAge, undefined);
  }
  const page = run({pathname: '/ja/', cookie: 'speedle_locale=ja; speedle_locale_remember=1'});
  assert.equal(page.input.checked, true);
  assert.deepEqual(page.writes, [], 'render must not renew an existing consent period');
});

test('explicit localized and documentation URLs remain stable', () => {
  for (const pathname of ['/ja/', '/zh/patterns/', '/patterns/']) {
    const page = run({pathname, cookie: 'speedle_locale=es'});
    assert.deepEqual(page.redirects, []);
  }
});

test('English, invalid and malformed choices never redirect or get stored as a locale', () => {
  for (const cookie of ['', 'speedle_locale=en', 'speedle_locale=fr', 'speedle_locale=%2Fja%2F', 'speedle_locale=ja=es']) {
    const page = run({cookie});
    assert.deepEqual(page.redirects, []);
    const before = page.writes.length;
    page.select('fr');
    assert.equal(page.writes.length, before);
  }
});

test('blocked cookies leave language selection usable and cannot falsely check remember', () => {
  const page = run({blocked: true});
  assert.doesNotThrow(() => page.select('ja'));
  assert.doesNotThrow(() => page.remember(true));
  assert.equal(page.input.checked, false);
  assert.doesNotThrow(page.clear);
  assert.deepEqual(page.redirects, []);
  assert.deepEqual(page.writes, []);
});

test('preview, staging and insecure hosts never use production preferences', () => {
  for (const options of [{hostname: 'localhost'}, {hostname: 'b.speedle.io'}, {hostname: 'g.speedle.io'}, {hostname: 'preview.example'}, {protocol: 'http:'}]) {
    const page = run({...options, cookie: 'speedle_locale=ja; speedle_locale_remember=1'});
    assert.equal(page.input.disabled, true);
    page.select('es');
    page.remember(true);
    assert.equal(page.input.checked, false);
    assert.deepEqual(page.redirects, []);
    assert.deepEqual(page.writes, []);
  }
});

test('middle-click records the explicit choice but right-click remains inert', () => {
  const page = run({pathname: '/ja/'});
  page.select('en', 'auxclick', 1);
  assert.equal(page.jar.get('speedle_locale').value, 'en');
  const before = page.writes.length;
  page.select('es', 'auxclick', 2);
  page.select('es', 'click', 2);
  assert.equal(page.writes.length, before);
});

test('each language menu gets a localized opt-in and reset control', () => {
  for (const [lang, expected] of [['en', 'Remember my language'], ['zh-CN', '记住我的语言'], ['ja', '言語'], ['ko', '언어'], ['es', 'Recordar mi idioma']]) {
    const page = run({lang});
    const label = page.panel.children[0].children[0];
    assert.ok(label.children[1].textContent.includes(expected));
    assert.equal(label.children[0].type, 'checkbox');
    assert.equal(page.panel.children[0].children[1].type, 'button');
  }
});

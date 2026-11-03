'use strict';
const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('#site-nav');
function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', '展开导航');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? '收起导航' : '展开导航');
});
navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});
window.matchMedia('(min-width: 861px)').addEventListener('change', closeMenu);
const markScrolled = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', markScrolled, {passive: true});
markScrolled();

// Highlight the navigation link of the section crossing the middle of the viewport.
const sectionLinks = [...navigation.querySelectorAll('a[href^="#"]')];
if ('IntersectionObserver' in window) {
  const visible = new Set();
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id));
    sectionLinks.forEach(link => link.classList.toggle('is-active', visible.has(link.hash.slice(1))));
  }, {rootMargin: '-45% 0px -50% 0px'});
  sectionLinks.forEach(link => { const section = document.querySelector(link.hash); if (section) spy.observe(section); });
}

// The hero trace plays once through CSS; replaying restarts the animations.
const trace = document.querySelector('#trace');
function replayTrace() {
  trace.classList.remove('is-playing', 'is-paused');
  void trace.offsetWidth;
  trace.classList.add('is-playing');
}
document.querySelector('#trace-replay').addEventListener('click', replayTrace);
// When the page opens with the trace off-screen (short phones), hold it until it scrolls into view.
if ('IntersectionObserver' in window) {
  let initial = true;
  const watcher = new IntersectionObserver(([entry]) => {
    if (initial && !entry.isIntersecting) {
      trace.classList.add('is-paused');
    } else if (entry.isIntersecting) {
      trace.classList.remove('is-paused');
      watcher.disconnect();
    }
    initial = false;
  }, {threshold: 0.35});
  watcher.observe(trace);
}

// Browser-local illustration only; not the Speedle engine or an API client.
const demoForm = document.querySelector('#demo-form');
const agents = {research: '研究 Agent', support: '客服 Agent'};
const actions = {read: '读取', export: '导出', delete: '删除'};
const resources = {public: '公开知识库', customer: '客户资料库'};
const decision = document.querySelector('#decision');
const fields = Object.fromEntries([...document.querySelectorAll('[data-field]')].map(node => [node.dataset.field, node]));
function evaluate(agent, action, resource) {
  if (action === 'delete') {
    return {allow: false, rule: 'delete', code: 'DENY_POLICY_FOUND', reason: '示意规则显式拒绝所有 Agent 的删除操作。'};
  }
  if (agent === 'research' && resource === 'customer') {
    return {allow: false, rule: 'research', code: 'NO_APPLICABLE_POLICIES', reason: '研究 Agent 无权访问客户资料库，需要匹配该数据范围的授权。'};
  }
  if (agent === 'support' && action === 'export') {
    return {allow: false, rule: 'support', code: 'NO_APPLICABLE_POLICIES', reason: '客服 Agent 具有读取权限，但没有资料导出权限。'};
  }
  return {allow: true, rule: agent, code: 'GRANT_POLICY_FOUND', reason: agents[agent] + ' 可以' + actions[action] + resources[resource] + '。'};
}
function setField(name, value) {
  const node = fields[name];
  if (node.textContent === value) return;
  node.textContent = value;
  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
}
function updateDecision(animate) {
  const agent = demoForm.elements.agent.value;
  const action = demoForm.elements.action.value;
  const resource = demoForm.elements.resource.value;
  const result = evaluate(agent, action, resource);
  setField('subject', 'entity ' + agent + '-agent');
  setField('action', action);
  setField('resource', '/knowledge/' + resource);
  setField('allowed', String(result.allow));
  setField('reason', result.code);
  fields.allowed.classList.toggle('is-true', result.allow);
  fields.allowed.classList.toggle('is-false', !result.allow);
  decision.dataset.decision = result.allow ? 'allow' : 'deny';
  document.querySelector('#decision-code').textContent = result.allow ? 'ALLOW' : 'DENY';
  document.querySelector('#decision-name').textContent = result.allow ? '允许执行' : '拒绝执行';
  document.querySelector('#decision-reason').textContent = result.reason;
  document.querySelectorAll('.rules li').forEach(item => item.classList.toggle('is-match', item.dataset.rule === result.rule));
  if (animate) {
    decision.classList.remove('is-updated');
    void decision.offsetWidth;
    decision.classList.add('is-updated');
  }
}
demoForm.addEventListener('submit', event => event.preventDefault());
demoForm.addEventListener('change', () => updateDecision(true));
updateDecision(false);

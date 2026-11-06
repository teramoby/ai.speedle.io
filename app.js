'use strict';

const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('#site-nav');

function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
}

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('click', event => {
  if (!header.contains(event.target)) closeMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});
window.matchMedia('(min-width: 1001px)').addEventListener('change', closeMenu);

// Highlight the navigation link of the section crossing the middle of the viewport.
const sectionLinks = [...navigation.querySelectorAll('a[href^="#"]')];
if ('IntersectionObserver' in window) {
  const visible = new Set();
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id));
    const activeLink = sectionLinks.filter(link => visible.has(link.hash.slice(1))).pop();
    sectionLinks.forEach(link => link.classList.toggle('is-active', link === activeLink));
  }, {rootMargin: '-45% 0px -50% 0px'});
  sectionLinks.forEach(link => {
    const section = document.querySelector(link.hash);
    if (section) spy.observe(section);
  });
}

// Browser-local illustration only; not the Speedle engine or an API/MCP client.
const demoForm = document.querySelector('#demo-form');
const agents = {research: 'The research agent', support: 'The support agent'};
const actions = {read: 'read', export: 'export', delete: 'delete'};
const resources = {public: 'public knowledge', customer: 'customer records'};
const decision = document.querySelector('#decision');
const fields = Object.fromEntries([...document.querySelectorAll('[data-field]')].map(node => [node.dataset.field, node]));

function evaluate(agent, action, resource) {
  if (action === 'delete') {
    return {allow: false, rule: 'delete', code: 'DENY_POLICY_FOUND', reason: 'The simplified rules explicitly deny delete for every agent.'};
  }
  if (agent === 'research' && resource === 'customer') {
    return {allow: false, rule: 'research', code: 'NO_APPLICABLE_POLICIES', reason: 'The research agent has no grant for customer records.'};
  }
  if (agent === 'support' && action === 'export') {
    return {allow: false, rule: 'support', code: 'NO_APPLICABLE_POLICIES', reason: 'The support agent can read records but has no export grant.'};
  }
  return {allow: true, rule: agent, code: 'GRANT_POLICY_FOUND', reason: `${agents[agent]} can ${actions[action]} ${resources[resource]}.`};
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
  setField('subject', `entity ${agent}-agent`);
  setField('action', action);
  setField('resource', `/knowledge/${resource}`);
  setField('allowed', String(result.allow));
  setField('reason', result.code);
  fields.allowed.classList.toggle('is-true', result.allow);
  fields.allowed.classList.toggle('is-false', !result.allow);
  decision.dataset.decision = result.allow ? 'allow' : 'deny';
  document.querySelector('#decision-code').textContent = result.allow ? 'ALLOW' : 'DENY';
  document.querySelector('#decision-name').textContent = result.allow ? 'Action allowed' : 'Action denied';
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

'use strict';

/* Shared accessible menu controller from speedle.io header-20261027, with the v8 1160 px breakpoint. */
document.querySelectorAll('header.site-header').forEach(function(header) {
  var button = header.querySelector('.menu');
  var navigation = header.querySelector('.nav-links');
  if (!button || !navigation) return;
  function setOpen(open) {
    navigation.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? '×' : '☰';
  }
  button.addEventListener('click', function() {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  navigation.addEventListener('click', function(event) {
    if (event.target.closest('a')) setOpen(false);
  });
  header.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  window.matchMedia('(max-width: 1160px)').addEventListener('change', function() { setOpen(false); });
  // Collapse links only after their controller has initialized successfully.
  header.classList.add('navigation-ready');
});

// Shared Products dropdown; the same panel is inline in the collapsed menu.
document.querySelectorAll('.site-header .products').forEach(function(products) {
  var button = products.querySelector('.products-toggle');
  var panel = products.querySelector('.products-panel');
  var rows = Array.from(panel.querySelectorAll('.product-row'));
  var collapsed = window.matchMedia('(max-width: 1160px)');

  function setOpen(open) {
    products.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  }

  function openAndFocus(index) {
    setOpen(true);
    rows[index].focus();
  }

  button.addEventListener('click', function() {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  button.addEventListener('keydown', function(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openAndFocus(event.key === 'ArrowDown' ? 0 : rows.length - 1);
    } else if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  panel.addEventListener('click', function(event) {
    if (event.target.closest('a')) setOpen(false);
  });
  panel.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && !collapsed.matches) {
      event.preventDefault();
      setOpen(false);
      button.focus();
      return;
    }
    var current = rows.indexOf(document.activeElement);
    if (current < 0) return;
    var next;
    if (event.key === 'ArrowDown') next = (current + 1) % rows.length;
    if (event.key === 'ArrowUp') next = (current - 1 + rows.length) % rows.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      rows[next].focus();
    }
  });
  document.addEventListener('click', function(event) {
    if (!products.contains(event.target)) setOpen(false);
  });
  collapsed.addEventListener('change', function() { setOpen(false); });
});

const navigation = document.querySelector('#site-nav');

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
const chinese = document.documentElement.lang === 'zh-CN';
const agents = chinese
  ? {research: '研究智能体', support: '支持智能体'}
  : {research: 'The research agent', support: 'The support agent'};
const actions = chinese
  ? {read: '读取', export: '导出', delete: '删除'}
  : {read: 'read', export: 'export', delete: 'delete'};
const resources = chinese
  ? {public: '公共知识', customer: '客户记录'}
  : {public: 'public knowledge', customer: 'customer records'};
const demoText = chinese ? {
  deleteDenied: '简化规则明确拒绝所有智能体执行删除操作。',
  researchDenied: '研究智能体没有访问客户记录的授权。',
  supportDenied: '支持智能体可以读取记录，但没有导出权限。',
  allow: '允许',
  deny: '拒绝',
  allowedName: '操作已允许',
  deniedName: '操作已拒绝'
} : {
  deleteDenied: 'The simplified rules explicitly deny delete for every agent.',
  researchDenied: 'The research agent has no grant for customer records.',
  supportDenied: 'The support agent can read records but has no export grant.',
  allow: 'ALLOW',
  deny: 'DENY',
  allowedName: 'Action allowed',
  deniedName: 'Action denied'
};
const decision = document.querySelector('#decision');
const fields = Object.fromEntries([...document.querySelectorAll('[data-field]')].map(node => [node.dataset.field, node]));

function evaluate(agent, action, resource) {
  if (action === 'delete') {
    return {allow: false, rule: 'delete', code: 'DENY_POLICY_FOUND', reason: demoText.deleteDenied};
  }
  if (agent === 'research' && resource === 'customer') {
    return {allow: false, rule: 'research', code: 'NO_APPLICABLE_POLICIES', reason: demoText.researchDenied};
  }
  if (agent === 'support' && action === 'export') {
    return {allow: false, rule: 'support', code: 'NO_APPLICABLE_POLICIES', reason: demoText.supportDenied};
  }
  const reason = chinese
    ? `${agents[agent]}可以${actions[action]}${resources[resource]}。`
    : `${agents[agent]} can ${actions[action]} ${resources[resource]}.`;
  return {allow: true, rule: agent, code: 'GRANT_POLICY_FOUND', reason};
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
  document.querySelector('#decision-code').textContent = result.allow ? demoText.allow : demoText.deny;
  document.querySelector('#decision-name').textContent = result.allow ? demoText.allowedName : demoText.deniedName;
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

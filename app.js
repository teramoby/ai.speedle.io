'use strict';
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
window.matchMedia('(min-width: 821px)').addEventListener('change', closeMenu);
// Browser-local illustration only; not the Speedle engine or an API client.
const demoForm = document.querySelector('#demo-form');
const agents = {research: '研究 Agent', support: '客服 Agent'};
const actions = {read: '读取', export: '导出', delete: '删除'};
const resources = {public: '公开知识库', customer: '客户资料库'};
function updateDecision() {
  const agent = demoForm.elements.agent.value;
  const action = demoForm.elements.action.value;
  const resource = demoForm.elements.resource.value;
  let allow = true;
  let reason = agents[agent] + ' 可以' + actions[action] + resources[resource] + '。';
  if (action === 'delete') {
    allow = false;
    reason = '示意规则显式拒绝所有 Agent 的删除操作。';
  } else if (agent === 'research' && resource === 'customer') {
    allow = false;
    reason = '研究 Agent 无权访问客户资料库，需要匹配该数据范围的授权。';
  } else if (agent === 'support' && action === 'export') {
    allow = false;
    reason = '客服 Agent 具有读取权限，但没有资料导出权限。';
  }
  document.querySelector('#request-preview').textContent = 'agent     ' + agent + '-agent\naction    ' + action + '\nresource  knowledge:' + resource;
  document.querySelector('#decision').dataset.decision = allow ? 'allow' : 'deny';
  document.querySelector('#decision-symbol').textContent = allow ? '✓' : '×';
  document.querySelector('#decision-name').textContent = allow ? '允许执行' : '拒绝执行';
  document.querySelector('#decision-code').textContent = allow ? 'ALLOW' : 'DENY';
  document.querySelector('#decision-reason').textContent = reason;
}
demoForm.addEventListener('submit', event => { event.preventDefault(); updateDecision(); });
demoForm.addEventListener('change', updateDecision);
updateDecision();

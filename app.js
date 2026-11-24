'use strict';

/* Share only an explicit language-menu choice across the production sites. */
(function () {
  var hosts = ['speedle.io', 'engine.speedle.io', 'ai.speedle.io', 'cloud.speedle.io'];
  if (typeof location === 'undefined' || location.protocol !== 'https:' || hosts.indexOf(location.hostname) < 0) return;
  var locales = ['en', 'ja', 'ko', 'es', 'zh-CN'];
  var preference = null;
  try {
    document.cookie.split(';').some(function (part) {
      var pair = part.trim().split('=');
      if (pair[0] !== 'speedle_locale' || pair.length !== 2) return false;
      if (locales.indexOf(pair[1]) < 0) return false;
      preference = pair[1];
      return true;
    });
  } catch (error) {
    // A language link must still work when cookies are unavailable.
  }

  function rememberChoice(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    if (event.type === 'click' && event.button > 0) return;
    var target = event.target;
    var link = target && typeof target.closest === 'function' && target.closest('.languages a[hreflang], #top-nav-lang a[hreflang]');
    if (!link || event.defaultPrevented) return;
    var locale = link.getAttribute('hreflang');
    if (locales.indexOf(locale) < 0) return;
    try {
      document.cookie = 'speedle_locale=' + locale + '; Domain=speedle.io; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
    } catch (error) {
      // The real localized href remains the fallback; do not prevent navigation.
    }
  }
  document.addEventListener('click', rememberChoice, true);
  document.addEventListener('auxclick', rememberChoice, true);

  // Only the neutral homepage follows a saved choice. A specific language URL
  // or documentation link remains stable and never overwrites the preference.
  if (preference && preference !== 'en' && (location.pathname === '/' || location.pathname === '/index.html')) {
    var prefix = preference === 'zh-CN' ? 'zh' : preference;
    location.replace('/' + prefix + '/' + location.search + location.hash);
  }
})();

// Keep code selectable when JavaScript or clipboard access is unavailable.
function legacyCopy(text) {
  if (typeof document.execCommand !== 'function') return false;
  const active = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.className = 'command-copy-input';
  input.value = text;
  input.readOnly = true;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  document.body.append(input);
  try {
    input.focus({preventScroll: true});
    input.select();
    input.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } finally {
    input.remove();
    if (active && active.isConnected) active.focus({preventScroll: true});
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}

async function copyCommand(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Older contexts and denied async clipboard access can use selection copy.
    }
  }
  return legacyCopy(text);
}

document.querySelectorAll('.install-copy').forEach(function(block) {
  const button = block.querySelector('.command-copy-button');
  const code = block.querySelector('pre code');
  const status = block.querySelector('.command-copy-status');
  const tooltip = block.querySelector('.copy-tooltip');
  if (!button || !code || !status || !tooltip) return;
  let busy = false;
  let reset;
  button.hidden = false;
  button.addEventListener('click', async function() {
    if (busy) return;
    busy = true;
    clearTimeout(reset);
    delete button.dataset.state;
    tooltip.textContent = button.getAttribute('aria-label');
    status.textContent = '';
    try {
      if (!await copyCommand(code.textContent)) throw new Error('Clipboard unavailable');
      button.dataset.state = 'copied';
      tooltip.textContent = button.dataset.success;
      status.textContent = button.dataset.success;
    } catch {
      button.dataset.state = 'error';
      tooltip.textContent = button.dataset.failure;
      status.textContent = button.dataset.failure;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } finally {
      busy = false;
      reset = setTimeout(function() {
        delete button.dataset.state;
        tooltip.textContent = button.getAttribute('aria-label');
      }, 2200);
    }
  });
});

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

// Shared Languages dropdown; the same panel is inline in the collapsed menu.
document.querySelectorAll('.site-header .languages').forEach(function(languages) {
  var button = languages.querySelector('.languages-button');
  var panel = languages.querySelector('.languages-panel');
  if (!button || !panel) return;
  var rows = Array.from(panel.querySelectorAll('.language-row'));
  var collapsed = window.matchMedia('(max-width: 1160px)');

  function setOpen(open) {
    languages.classList.toggle('is-open', open);
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
    if (!languages.contains(event.target)) setOpen(false);
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

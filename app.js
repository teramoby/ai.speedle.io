'use strict';

// Keep the prompt selectable when JavaScript or clipboard access is unavailable.
document.querySelectorAll('.skill-install').forEach(function(card) {
  const button = card.querySelector('.copy-prompt');
  const prompt = card.querySelector('.install-prompt code');
  const status = card.querySelector('.copy-status');
  if (!button || !prompt || !status) return;
  button.hidden = false;
  button.addEventListener('click', async function() {
    button.disabled = true;
    status.textContent = '';
    try {
      await navigator.clipboard.writeText(prompt.textContent);
      status.textContent = button.dataset.success;
    } catch {
      status.textContent = button.dataset.failure;
    } finally {
      button.disabled = false;
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

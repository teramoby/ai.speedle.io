#!/usr/bin/env node
// Verifies that text in SVG diagrams and cards remains inside its containers
// across all localized pages at desktop (1440px) and mobile (390px) viewports.
//
// Requires Chrome or Chromium (installed in GitHub Actions runners and common dev setups).
// Zero npm dependencies. Run from anywhere:
//   node scripts/check-diagrams.mjs

import { spawn } from 'node:child_process';
import { existsSync, createReadStream } from 'node:fs';
import http from 'node:http';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const chromePath = findChrome();
if (!chromePath) {
  if (process.env.CI) {
    console.error('ERROR: Google Chrome / Chromium is required in CI to verify diagrams.');
    process.exit(1);
  } else {
    console.warn('Google Chrome / Chromium not found; skipping browser diagram checks.');
    process.exit(0);
  }
}

// Start a lightweight local static server on an ephemeral port
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath.endsWith('/')) reqPath += 'index.html';
  const filePath = join(root, reqPath);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };
  res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

await new Promise((resolve, reject) => {
  server.listen(0, '127.0.0.1', () => resolve());
  server.on('error', reject);
});

const port = server.address().port;

// Launch headless Chrome
const chromeProc = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-background-networking'
]);

let browserWsUrl = '';
const browserWsPromise = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('Timeout waiting for Chrome DevTools WebSocket URL'));
  }, 10000);

  chromeProc.stderr.on('data', (data) => {
    const match = data.toString().match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+/);
    if (match) {
      clearTimeout(timeout);
      browserWsUrl = match[0];
      resolve(browserWsUrl);
    }
  });

  chromeProc.on('error', (err) => {
    clearTimeout(timeout);
    reject(err);
  });
});

let exitCode = 0;

try {
  await browserWsPromise;

  const browserWs = new WebSocket(browserWsUrl);
  await new Promise((resolve, reject) => {
    browserWs.onopen = resolve;
    browserWs.onerror = reject;
  });

  let msgId = 1;
  const pendingRequests = new Map();
  browserWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      pendingRequests.get(data.id)(data);
      pendingRequests.delete(data.id);
    }
  };

  function sendBrowser(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      pendingRequests.set(id, (data) => {
        clearTimeout(timer);
        if (data.error) {
          reject(new Error(`CDP ${method} error: ${data.error.message || JSON.stringify(data.error)}`));
          return;
        }
        resolve(data);
      });
      browserWs.send(JSON.stringify({ id, method, params }));
    });
  }

  const { result: { targetId } } = await sendBrowser('Target.createTarget', { url: 'about:blank' });
  const pageWsUrl = browserWsUrl.replace(/\/devtools\/browser\/[^\s]+/, `/devtools/page/${targetId}`);
  const pageWs = new WebSocket(pageWsUrl);
  await new Promise((resolve, reject) => {
    pageWs.onopen = resolve;
    pageWs.onerror = reject;
  });

  let pageMsgId = 1;
  const pagePendingRequests = new Map();
  const pageEventWaiters = new Map();
  pageWs.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (data.id && pagePendingRequests.has(data.id)) {
      const resolve = pagePendingRequests.get(data.id);
      pagePendingRequests.delete(data.id);
      resolve(data);
      return;
    }
    if (data.method && pageEventWaiters.has(data.method)) {
      const waiters = pageEventWaiters.get(data.method);
      pageEventWaiters.delete(data.method);
      for (const resolve of waiters) resolve(data);
    }
  };

  function sendPage(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = pageMsgId++;
      const timer = setTimeout(() => {
        pagePendingRequests.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      pagePendingRequests.set(id, (data) => {
        clearTimeout(timer);
        if (data.error) {
          reject(new Error(`CDP ${method} error: ${data.error.message || JSON.stringify(data.error)}`));
          return;
        }
        resolve(data);
      });
      pageWs.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitForPageEvent(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let waiter;
      const timer = setTimeout(() => {
        const pending = pageEventWaiters.get(method);
        if (pending) {
          const rest = pending.filter((fn) => fn !== waiter);
          if (rest.length) pageEventWaiters.set(method, rest);
          else pageEventWaiters.delete(method);
        }
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      waiter = (data) => {
        clearTimeout(timer);
        resolve(data);
      };
      const pending = pageEventWaiters.get(method) || [];
      pending.push(waiter);
      pageEventWaiters.set(method, pending);
    });
  }

  function sameDocumentUrl(actual, expected) {
    const a = new URL(actual);
    const e = new URL(expected);
    const path = (value) => (value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value);
    return a.origin === e.origin && path(a.pathname) === path(e.pathname) && a.search === e.search;
  }

  async function readDocumentState(label) {
    const evalResult = await sendPage('Runtime.evaluate', {
      expression: '({ readyState: document.readyState, href: location.href })',
      returnByValue: true
    });
    if (evalResult.result?.exceptionDetails) {
      const details = evalResult.result.exceptionDetails;
      throw new Error(`${label}: ${details.exception?.description || details.text || 'could not read document state'}`);
    }
    const value = evalResult.result?.result?.value;
    if (!value || typeof value.readyState !== 'string' || typeof value.href !== 'string') {
      throw new Error(`${label}: document state was not returned`);
    }
    return value;
  }

  async function openPage(url) {
    const loaded = waitForPageEvent('Page.loadEventFired');
    // A navigate failure must not leave this waiter to reject later.
    loaded.catch(() => {});
    const nav = await sendPage('Page.navigate', { url });
    if (nav.result?.errorText) {
      throw new Error(`Page.navigate to ${url} failed: ${nav.result.errorText}`);
    }
    await loaded;
    const state = await readDocumentState(url);
    if (state.readyState !== 'complete') {
      throw new Error(`Expected document.readyState "complete" for ${url}, got "${state.readyState}"`);
    }
    if (!sameDocumentUrl(state.href, url)) {
      throw new Error(`Expected ${url} but document is ${state.href}`);
    }
  }

  async function settleLayout() {
    const evalResult = await sendPage('Runtime.evaluate', {
      expression: 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
      awaitPromise: true,
      returnByValue: true
    });
    if (evalResult.result?.exceptionDetails) {
      const details = evalResult.result.exceptionDetails;
      throw new Error(`layout wait failed: ${details.exception?.description || details.text || 'exception'}`);
    }
    if (evalResult.result?.result?.value !== true) {
      throw new Error('layout wait did not finish');
    }
  }

  function takeIssues(evalResult) {
    const remote = evalResult.result;
    if (!remote) throw new Error('missing evaluation result');
    if (remote.exceptionDetails) {
      const details = remote.exceptionDetails;
      throw new Error(details.exception?.description || details.text || 'evaluation exception');
    }
    const value = remote.result?.value;
    if (!value || !Array.isArray(value.issues)) {
      throw new Error('evaluation did not return an issue array');
    }
    if (typeof value.cardsChecked !== 'number' || value.cardsChecked < 1) {
      throw new Error('no diagram cards were checked');
    }
    return value.issues;
  }

  await sendPage('Page.enable');
  await sendPage('DOM.enable');

  const checkExpression = `(() => {
    const issues = [];
    let cardsChecked = 0;

    function check2DOverlap(b1, b2) {
      return (
        b1.x < b2.x + b2.width &&
        b1.x + b1.width > b2.x &&
        b1.y < b2.y + b2.height &&
        b1.y + b1.height > b2.y
      );
    }

    // Check SVG diagrams: .cd-wide (desktop) and .cd-stack (mobile)
    const svgs = Array.from(document.querySelectorAll('svg.cd'));
    for (const svg of svgs) {
      if (getComputedStyle(svg).display === 'none') continue;
      const isStack = svg.classList.contains('cd-stack');
      const variant = isStack ? 'cd-stack' : 'cd-wide';

      // 1. Check card text overflows
      const cards = svg.querySelectorAll('.cd-card');
      cards.forEach((card, idx) => {
        const bgRect = card.querySelector('rect:first-child');
        if (!bgRect) return;
        cardsChecked += 1;
        const bgBox = bgRect.getBBox();
        const texts = card.querySelectorAll('text');
        texts.forEach(t => {
          const tb = t.getBBox();
          if (tb.width === 0 && tb.height === 0) return;
          // 1.5 user units of slack on the horizontal edges absorbs subpixel
          // font metrics. Vertical slack is smaller: glyph descent that crosses
          // the card border by about one unit must still fail.
          const rightOverflow = (tb.x + tb.width) - (bgBox.x + bgBox.width);
          const leftOverflow = bgBox.x - tb.x;
          const bottomOverflow = (tb.y + tb.height) - (bgBox.y + bgBox.height);
          const topOverflow = bgBox.y - tb.y;
          const edges = [
            ['right', rightOverflow, 1.5],
            ['left', leftOverflow, 1.5],
            ['bottom', bottomOverflow, 0.5],
            ['top', topOverflow, 0.5]
          ];
          for (const [edge, overflow, tolerance] of edges) {
            if (overflow > tolerance) {
              issues.push({
                variant,
                type: 'card-text-overflow',
                edge,
                cardIndex: idx,
                text: t.textContent.trim(),
                overflowPx: Math.round(overflow)
              });
            }
          }
        });
      });

      // 2. Check lane label / subtitle overlaps
      const buildLane = svg.querySelector('.cd-lane-build');
      if (buildLane) {
        const label = buildLane.querySelector('.cd-label');
        const sub = buildLane.querySelector('.cd-sub');
        if (label && sub && check2DOverlap(label.getBBox(), sub.getBBox())) {
          issues.push({
            variant,
            type: 'lane-label-overlap',
            lane: 'build',
            label: label.textContent.trim(),
            sub: sub.textContent.trim()
          });
        }
      }

      const runLane = svg.querySelector('.cd-lane-run');
      if (runLane) {
        const label = runLane.querySelector('.cd-label');
        const sub = runLane.querySelector('.cd-sub');
        if (label && sub && check2DOverlap(label.getBBox(), sub.getBBox())) {
          issues.push({
            variant,
            type: 'lane-label-overlap',
            lane: 'run',
            label: label.textContent.trim(),
            sub: sub.textContent.trim()
          });
        }
      }

      // 3. Check audit band divider & label overlap
      const auditBand = svg.querySelector('.cd-band-audit');
      if (auditBand) {
        const labels = auditBand.querySelectorAll('.cd-label');
        const divider = auditBand.querySelector('.cd-divider');
        if (divider) {
          const divX = parseFloat(divider.getAttribute('x1'));
          labels.forEach(label => {
            const lb = label.getBBox();
            if (lb.x + lb.width > divX + 1.5) {
              issues.push({
                variant,
                type: 'audit-label-overlap',
                label: label.textContent.trim(),
                overflowPx: Math.round((lb.x + lb.width) - divX)
              });
            }
          });
        }
      }

      // 4. Check PDP chip / answer text overflow
      const chip = svg.querySelector('.cd-pdp-chip');
      const chipAns = svg.querySelector('.cd-pdp-answer');
      if (chip && chipAns) {
        const cb = chip.getBBox();
        const ab = chipAns.getBBox();
        if (ab.width > cb.width - 4) {
          issues.push({
            variant,
            type: 'chip-answer-overflow',
            text: chipAns.textContent.trim(),
            textWidth: Math.round(ab.width),
            chipWidth: Math.round(cb.width)
          });
        }
      }
    }

    return { issues, cardsChecked };
  })()`;

  const languages = ['en', 'zh', 'ja', 'ko', 'es'];
  const viewports = [
    { width: 1440, height: 900, mobile: false, label: '1440px' },
    { width: 390, height: 844, mobile: true, label: '390px' }
  ];

  let totalIssues = 0;
  let checked = 0;
  const expectedChecks = languages.length * viewports.length;
  const unchecked = [];

  for (const lang of languages) {
    const pagePath = lang === 'en' ? '/' : `/${lang}/`;
    const url = `http://127.0.0.1:${port}${pagePath}`;
    try {
      await openPage(url);
    } catch (err) {
      for (const vp of viewports) {
        unchecked.push(`${lang} at ${vp.label}: ${err.message}`);
      }
      continue;
    }

    for (const vp of viewports) {
      const label = `${lang} at ${vp.label}`;
      try {
        await sendPage('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.mobile
        });
        await settleLayout();
        const evalResult = await sendPage('Runtime.evaluate', {
          expression: checkExpression,
          returnByValue: true
        });
        const issues = takeIssues(evalResult);
        checked += 1;
        if (issues.length > 0) {
          totalIssues += issues.length;
          console.error(`FAIL: ${label}: ${issues.length} diagram issue(s):`);
          for (const item of issues) {
            console.error(`  - [${item.type}] ${JSON.stringify(item)}`);
          }
        }
      } catch (err) {
        unchecked.push(`${label}: ${err.message}`);
      }
    }
  }

  if (unchecked.length > 0 || checked !== expectedChecks) {
    console.error(`FAILED: ${unchecked.length} diagram check(s) did not run (${checked}/${expectedChecks} completed).`);
    for (const item of unchecked) console.error(`  - ${item}`);
    exitCode = 1;
  }
  if (totalIssues > 0) {
    console.error(`FAILED: ${totalIssues} diagram text overflow issue(s) detected.`);
    exitCode = 1;
  }
  if (exitCode === 0) {
    console.log('PASS: diagram text boxes verified across all 5 languages at 1440px and 390px');
  }

  pageWs.close();
  browserWs.close();
} catch (err) {
  console.error('Error during diagram check:', err);
  exitCode = 1;
} finally {
  chromeProc.kill('SIGKILL');
  server.close();
  process.exit(exitCode);
}

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

  function sendBrowser(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pendingRequests.set(id, resolve);
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
  pageWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pagePendingRequests.has(data.id)) {
      pagePendingRequests.get(data.id)(data);
      pagePendingRequests.delete(data.id);
    }
  };

  function sendPage(method, params = {}) {
    return new Promise((resolve) => {
      const id = pageMsgId++;
      pagePendingRequests.set(id, resolve);
      pageWs.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendPage('Page.enable');
  await sendPage('DOM.enable');

  const checkExpression = `(() => {
    const issues = [];

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
        const bgBox = bgRect.getBBox();
        const texts = card.querySelectorAll('text');
        texts.forEach(t => {
          const tb = t.getBBox();
          // Tolerance of 1.5px for antialiasing / subpixel font metrics
          if (tb.x + tb.width > bgBox.x + bgBox.width + 1.5) {
            issues.push({
              variant,
              type: 'card-text-overflow',
              cardIndex: idx,
              text: t.textContent.trim(),
              overflowPx: Math.round((tb.x + tb.width) - (bgBox.x + bgBox.width))
            });
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

    return issues;
  })()`;

  const languages = ['en', 'zh', 'ja', 'ko', 'es'];
  const viewports = [
    { width: 1440, height: 900, mobile: false, label: '1440px' },
    { width: 390, height: 844, mobile: true, label: '390px' }
  ];

  let totalIssues = 0;

  for (const lang of languages) {
    const pagePath = lang === 'en' ? '/' : `/${lang}/`;
    await sendPage('Page.navigate', { url: `http://127.0.0.1:${port}${pagePath}` });
    await new Promise(r => setTimeout(r, 400));

    for (const vp of viewports) {
      await sendPage('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await new Promise(r => setTimeout(r, 200));

      const evalResult = await sendPage('Runtime.evaluate', {
        expression: checkExpression,
        returnByValue: true
      });

      const issues = evalResult.result?.result?.value || [];
      if (issues.length > 0) {
        totalIssues += issues.length;
        console.error(`FAIL: ${lang} at ${vp.label}: ${issues.length} diagram issue(s):`);
        for (const item of issues) {
          console.error(`  - [${item.type}] ${JSON.stringify(item)}`);
        }
      }
    }
  }

  if (totalIssues > 0) {
    console.error(`\nFAILED: ${totalIssues} diagram text overflow issue(s) detected.`);
    exitCode = 1;
  } else {
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

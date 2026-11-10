#!/usr/bin/env node
// Checks the hand-maintained SEO/GEO files and every localized page.
//
// No dependencies. Run from anywhere:
//   node scripts/check-seo.mjs
//
// It verifies sitemap and llms link targets, hreflang alternates, page metadata,
// JSON-LD and the absence of FAQ content, the language switch, Cloudflare Web
// Analytics, headline punctuation, byte-identical SPDL examples across the
// English and Chinese patterns pages, and the shared 404 page.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://ai.speedle.io';
const errors = [];
let checks = 0;

function check(ok, message) {
  checks += 1;
  if (!ok) errors.push(message);
}

function read(name) {
  const path = join(root, name);
  check(existsSync(path), `${name} is missing`);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

// Map https://ai.speedle.io/<path> to a file in this repository and, for
// fragment URLs, to an id in that file. Directory URLs map to their index.html.
const pages = new Map();
function localTarget(url, base = `${origin}/`) {
  let parsed;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  const path = decodeURIComponent(parsed.pathname);
  let file;
  if (path === '/' || path === '') file = 'index.html';
  else if (path.endsWith('/')) file = `${path.replace(/^\//, '')}index.html`;
  else file = path.replace(/^\//, '');
  return { file, hash: parsed.hash.slice(1) };
}

function htmlFor(file) {
  if (!pages.has(file)) {
    const path = join(root, file);
    pages.set(file, existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : '');
  }
  return pages.get(file);
}

function checkInternalUrl(url, source, base = `${origin}/`) {
  const target = localTarget(url, base);
  if (target) {
    const html = htmlFor(target.file);
    check(html !== '', `${source}: ${url} has no local file (${target.file})`);
    if (target.hash && html) {
      const escaped = target.hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      check(new RegExp(`id="${escaped}"`).test(html), `${source}: ${url} has no matching id="${target.hash}"`);
    }
    return;
  }
  let parsed;
  try {
    parsed = new URL(url, base);
  } catch {
    return;
  }
  check(parsed.protocol === 'https:' || parsed.protocol === 'mailto:', `${source}: ${url} must use https`);
}

function count(html, needle) {
  return html.split(needle).length - 1;
}

// --- robots.txt -----------------------------------------------------------

const robots = read('robots.txt');
check(/^User-agent: \*$/m.test(robots), 'robots.txt must have a "User-agent: *" group');
check(/^Allow: \/$/m.test(robots), 'robots.txt must allow public pages');
check(/^Sitemap: https:\/\/ai\.speedle\.io\/sitemap\.xml$/m.test(robots), 'robots.txt must reference https://ai.speedle.io/sitemap.xml');
check(!/^Disallow: \/$/m.test(robots), 'robots.txt must not disallow the whole site');
for (const bot of [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot'
]) {
  check(new RegExp(`^User-agent: ${bot}$`, 'm').test(robots), `robots.txt must name the AI crawler ${bot}`);
}

// --- sitemap.xml ----------------------------------------------------------

const sitemap = read('sitemap.xml');
check(sitemap.trimStart().startsWith('<?xml'), 'sitemap.xml must start with an XML declaration');
check(/<urlset\s[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap), 'sitemap.xml must use the sitemap 0.9 namespace');
check(/xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(sitemap), 'sitemap.xml must declare the xhtml namespace for hreflang');
const sitemapEntries = new Map();
for (const match of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const block = match[1];
  const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
  if (!loc) {
    check(false, 'sitemap.xml contains a <url> without a <loc>');
    continue;
  }
  const alternates = [...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)]
    .map(alt => ({ lang: alt[1], href: alt[2] }));
  sitemapEntries.set(loc, { block, alternates });
}
const locations = [...sitemapEntries.keys()];
check(locations.length === 10, `sitemap.xml must contain all five home pages and five patterns pages (found ${locations.length})`);
for (const path of ['/', '/zh/', '/ja/', '/ko/', '/es/', '/patterns/', '/zh/patterns/', '/ja/patterns/', '/ko/patterns/', '/es/patterns/']) {
  check(sitemapEntries.has(`${origin}${path}`), `sitemap.xml must contain ${origin}${path}`);
}
for (const [loc, { block, alternates }] of sitemapEntries) {
  check(loc.startsWith(`${origin}/`), `sitemap.xml: ${loc} must be on ${origin}`);
  const target = localTarget(loc);
  check(target !== null && htmlFor(target.file) !== '', `sitemap.xml: ${loc} has no local page`);
  check(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(block), `sitemap.xml: ${loc} needs a <lastmod>`);
  check(alternates.length === 3, `sitemap.xml: ${loc} must have exactly three hreflang alternates`);
  for (const alt of alternates) checkInternalUrl(alt.href, 'sitemap.xml hreflang');
}
const sitemapAlternates = [...sitemapEntries.values()].flatMap(entry => entry.alternates);

// --- localized page metadata and JSON-LD ----------------------------------

const homeAlternates = {
  en: `${origin}/`,
  'zh-CN': `${origin}/zh/`,
  'x-default': `${origin}/`
};
const patternsAlternates = {
  en: `${origin}/patterns/`,
  'zh-CN': `${origin}/zh/patterns/`,
  'x-default': `${origin}/patterns/`
};
const pageDefinitions = [
  { file: 'index.html', canonical: `${origin}/`, language: 'en', alternates: homeAlternates },
  { file: 'zh/index.html', canonical: `${origin}/zh/`, language: 'zh-CN', alternates: homeAlternates },
  { file: 'ja/index.html', canonical: `${origin}/ja/`, language: 'ja', alternates: homeAlternates },
  { file: 'ko/index.html', canonical: `${origin}/ko/`, language: 'ko', alternates: homeAlternates },
  { file: 'es/index.html', canonical: `${origin}/es/`, language: 'es', alternates: homeAlternates },
  { file: 'patterns/index.html', canonical: `${origin}/patterns/`, language: 'en', alternates: patternsAlternates },
  { file: 'zh/patterns/index.html', canonical: `${origin}/zh/patterns/`, language: 'zh-CN', alternates: patternsAlternates },
  { file: 'ja/patterns/index.html', canonical: `${origin}/ja/patterns/`, language: 'ja', alternates: patternsAlternates },
  { file: 'ko/patterns/index.html', canonical: `${origin}/ko/patterns/`, language: 'ko', alternates: patternsAlternates },
  { file: 'es/patterns/index.html', canonical: `${origin}/es/patterns/`, language: 'es', alternates: patternsAlternates }
];
const pageReports = [];

function checkPage(definition) {
  const { file, canonical, language, alternates } = definition;
  const html = read(file);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  check(title.length > 0 && title.length <= 60, `${file}: title must be 1-60 characters (is ${title.length})`);
  check(description.length > 0 && description.length <= 155, `${file}: meta description must be 1-155 characters (is ${description.length})`);
  check(html.includes(`<html lang="${language}">`), `${file}: <html> must declare lang="${language}"`);
  check(html.includes(`<link rel="canonical" href="${canonical}">`), `${file}: canonical URL must be ${canonical}`);
  check(html.includes(`<meta property="og:url" content="${canonical}">`), `${file}: og:url must be ${canonical}`);
  check(html.includes(`<meta property="og:title" content="${title}">`), `${file}: og:title must match the page title`);
  check(html.includes(`<meta name="twitter:title" content="${title}">`), `${file}: twitter:title must match the page title`);

  const pageAlternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
    .map(match => ({ lang: match[1], href: match[2] }));
  check(pageAlternates.length === 3, `${file}: must have exactly three hreflang alternates`);
  const sitemapEntry = sitemapEntries.get(canonical);
  check(sitemapEntry !== undefined, `${file}: canonical URL must have a sitemap entry`);
  for (const [lang, href] of Object.entries(alternates)) {
    const pageAlt = pageAlternates.find(alt => alt.lang === lang);
    const mapAlt = sitemapEntry && sitemapEntry.alternates.find(alt => alt.lang === lang);
    check(pageAlt !== undefined, `${file}: must declare hreflang="${lang}"`);
    check(mapAlt !== undefined, `sitemap.xml: ${canonical} must declare hreflang="${lang}"`);
    check(pageAlt && pageAlt.href === href, `${file}: hreflang="${lang}" must point to ${href}`);
    check(mapAlt && mapAlt.href === href, `sitemap.xml: ${canonical} hreflang="${lang}" must point to ${href}`);
  }
  check((html.match(/<h1[\s>]/g) || []).length === 1, `${file}: must have exactly one <h1>`);
  for (const heading of html.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
    check(!/[.。]\s*$/.test(heading[2]), `${file}: <h${heading[1]}> must not end with a full stop: ${heading[2].trim()}`);
  }
  const languagesBlock = block(html, /<div class="languages">[\s\S]*?<\/div>\s*<\/div>/);
  check(languagesBlock !== '', `${file}: missing .languages dropdown block`);
  check(new RegExp(`<div class="languages">[\\s\\S]*?<\\/nav>`).test(html), `${file}: languages dropdown must be the last navigation item`);
  const activeRow = (languagesBlock.match(/<a\b[^>]*\baria-current="page"[^>]*>([\s\S]*?)<\/a>/) || [])[0] || '';
  check(activeRow !== '', `${file}: languages dropdown must mark current page with aria-current="page"`);
  check(activeRow.includes(`hreflang="${language}"`), `${file}: aria-current="page" must match page language ${language}`);
  for (const lang of ['en', 'zh-CN', 'ja', 'ko', 'es']) {
    check(languagesBlock.includes(`hreflang="${lang}"`), `${file}: languages dropdown must list ${lang}`);
  }
  const siteNav = (html.match(/<nav id="site-nav"[\s\S]*?<\/nav>/) || [])[0] || '';
  for (const href of ['https://engine.speedle.io/', 'https://engine.speedle.io/zh/', 'https://cloud.speedle.io/', 'https://cloud.speedle.io/zh-CN/']) {
    const product = href.includes('engine') ? 'Engine' : 'Cloud';
    check(!siteNav.includes(`<a href="${href}">Speedle ${product}</a>`), `${file}: header must not contain a standalone Speedle ${product} link`);
  }

  // Cloudflare Web Analytics: the public site token, cookieless, before </body>.
  check(
    /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "3b49dd9a82634bba833340481ce6ccbe"\}'><\/script>/.test(html),
    `${file}: must load the Cloudflare Web Analytics beacon with the ai.speedle.io token`
  );
  check(
    html.lastIndexOf('cloudflareinsights.com/beacon.min.js') < html.lastIndexOf('</body>'),
    `${file}: Cloudflare Web Analytics beacon must be inside the page body`
  );
  check(/<meta property="og:image" content="https:\/\/ai\.speedle\.io\/assets\/og-image\.png">/.test(html), `${file}: og:image must point at the share image`);
  check(/<meta name="twitter:card" content="summary_large_image">/.test(html), `${file}: twitter:card must be summary_large_image`);

  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
  check(jsonLdBlocks.length > 0, `${file}: must contain JSON-LD`);
  const graph = [];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block);
      if (Array.isArray(data['@graph'])) graph.push(...data['@graph']);
      else graph.push(data);
    } catch (error) {
      check(false, `${file}: JSON-LD does not parse: ${error.message}`);
    }
  }
  const requiredTypes = ['Organization', 'WebSite', 'SoftwareApplication'];
  for (const type of requiredTypes) {
    check(graph.some(node => node['@type'] === type), `${file}: JSON-LD must include a ${type}`);
  }
  const website = graph.find(node => node['@type'] === 'WebSite');
  const software = graph.find(node => node['@type'] === 'SoftwareApplication');
  check(website && website.url === canonical && website.inLanguage === language, `${file}: WebSite URL and inLanguage must match the page`);
  check(software && software.url === canonical, `${file}: SoftwareApplication URL must match the page`);
  if (['zh-CN', 'ja', 'ko', 'es'].includes(language)) {
    check(software && software.inLanguage === language, `${file}: SoftwareApplication must declare inLanguage="${language}"`);
  }

  // No page has a FAQ or structured data for one.
  check(!graph.some(node => node['@type'] === 'FAQPage'), `${file}: must not include FAQPage JSON-LD`);
  check(!/<section\b[^>]*\bid=["']faq["']/.test(html), `${file}: must not have a visible FAQ section`);
  pageReports.push({ file, titleLength: title.length, descriptionLength: description.length, nodes: graph.length });
  return html;
}

const englishHtml = checkPage(pageDefinitions[0]);
const chineseHtml = checkPage(pageDefinitions[1]);
const japaneseHtml = checkPage(pageDefinitions[2]);
const koreanHtml = checkPage(pageDefinitions[3]);
const spanishHtml = checkPage(pageDefinitions[4]);
const englishPatternsHtml = checkPage(pageDefinitions[5]);
const chinesePatternsHtml = checkPage(pageDefinitions[6]);
const japanesePatternsHtml = checkPage(pageDefinitions[7]);
const koreanPatternsHtml = checkPage(pageDefinitions[8]);
const spanishPatternsHtml = checkPage(pageDefinitions[9]);

// Every link on every page resolves to a local file and fragment, or is a
// well-formed external URL.
for (const [html, base] of [
  [englishHtml, `${origin}/`],
  [chineseHtml, `${origin}/zh/`],
  [japaneseHtml, `${origin}/ja/`],
  [koreanHtml, `${origin}/ko/`],
  [spanishHtml, `${origin}/es/`],
  [englishPatternsHtml, `${origin}/patterns/`],
  [chinesePatternsHtml, `${origin}/zh/patterns/`],
  [japanesePatternsHtml, `${origin}/ja/patterns/`],
  [koreanPatternsHtml, `${origin}/ko/patterns/`],
  [spanishPatternsHtml, `${origin}/es/patterns/`]
]) {
  for (const link of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    checkInternalUrl(link[1], localTarget(base).file, base);
  }
}

// --- shared header and footer ---------------------------------------------

function block(html, pattern) {
  return (html.match(pattern) || [])[0] || '';
}

const englishHeader = block(englishHtml, /<header class="site-header">[\s\S]*?<\/header>/);
const chineseHeader = block(chineseHtml, /<header class="site-header">[\s\S]*?<\/header>/);
const japaneseHeader = block(japaneseHtml, /<header class="site-header">[\s\S]*?<\/header>/);
const koreanHeader = block(koreanHtml, /<header class="site-header">[\s\S]*?<\/header>/);
const spanishHeader = block(spanishHtml, /<header class="site-header">[\s\S]*?<\/header>/);

const englishFooter = block(englishHtml, /<footer class="site-footer">[\s\S]*?<\/footer>/);
const chineseFooter = block(chineseHtml, /<footer class="site-footer">[\s\S]*?<\/footer>/);
const japaneseFooter = block(japaneseHtml, /<footer class="site-footer">[\s\S]*?<\/footer>/);
const koreanFooter = block(koreanHtml, /<footer class="site-footer">[\s\S]*?<\/footer>/);
const spanishFooter = block(spanishHtml, /<footer class="site-footer">[\s\S]*?<\/footer>/);

function subpageHeader(header, anchorPrefix) {
  return header
    .replaceAll('href="#ai-for-access"', `href="${anchorPrefix}#ai-for-access"`)
    .replaceAll('href="#access-for-ai"', `href="${anchorPrefix}#access-for-ai"`)
    .replace('class="language-row" href="/zh/"', 'class="language-row" href="/zh/patterns/"')
    .replace('class="language-row" href="/ja/"', 'class="language-row" href="/ja/patterns/"')
    .replace('class="language-row" href="/ko/"', 'class="language-row" href="/ko/patterns/"')
    .replace('class="language-row" href="/es/"', 'class="language-row" href="/es/patterns/"')
    .replace('class="language-row" href="/"', 'class="language-row" href="/patterns/"');
}

for (const [lang, homeH, patHtml, homeF, anchorPrefix] of [
  ['index.html', englishHeader, englishPatternsHtml, englishFooter, '/'],
  ['zh/index.html', chineseHeader, chinesePatternsHtml, chineseFooter, '/zh/'],
  ['ja/index.html', japaneseHeader, japanesePatternsHtml, japaneseFooter, '/ja/'],
  ['ko/index.html', koreanHeader, koreanPatternsHtml, koreanFooter, '/ko/'],
  ['es/index.html', spanishHeader, spanishPatternsHtml, spanishFooter, '/es/']
]) {
  check(homeH !== '', `${lang}: header must not be empty`);
  check(homeF !== '', `${lang}: footer must not be empty`);
  const patH = block(patHtml, /<header class="site-header">[\s\S]*?<\/header>/);
  const patF = block(patHtml, /<footer class="site-footer">[\s\S]*?<\/footer>/);
  const expectedPatH = subpageHeader(homeH, anchorPrefix);
  check(patH === expectedPatH, `${lang} patterns header must match the shared header, with home-page anchors`);
  check(patF === homeF, `${lang} patterns footer must match the shared footer`);
}

// --- 404 page -------------------------------------------------------------

const notFound = read('404.html');

// The 404 page reuses the shared header and footer; its home-page section
// links must be root-relative because the page is served for arbitrary paths.
const sharedHeaderForNotFound = englishHeader
  .replaceAll('href="#ai-for-access"', 'href="/#ai-for-access"')
  .replaceAll('href="#access-for-ai"', 'href="/#access-for-ai"');
const notFoundHeader = block(notFound, /<header class="site-header">[\s\S]*?<\/header>/);
const notFoundFooter = block(notFound, /<footer class="site-footer">[\s\S]*?<\/footer>/);
check(englishHeader !== '' && notFoundHeader === sharedHeaderForNotFound, '404.html: header must match the shared header on index.html');
check(englishFooter !== '' && notFoundFooter === englishFooter, '404.html: footer must match the shared footer on index.html');

const notFoundTitle = (notFound.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const notFoundDescription = (notFound.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
check(notFoundTitle.length > 0 && notFoundTitle.length <= 60, `404.html: title must be 1-60 characters (is ${notFoundTitle.length})`);
check(!/[.。]\s*$/.test(notFoundTitle), '404.html: title must not end with a full stop');
check(notFoundDescription.length > 0 && notFoundDescription.length <= 155, `404.html: meta description must be 1-155 characters (is ${notFoundDescription.length})`);
check(notFound.includes('<meta name="robots" content="noindex">'), '404.html: must be noindex');
check((notFound.match(/<h1[\s>]/g) || []).length === 1, '404.html: must have exactly one <h1>');
for (const heading of notFound.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
  check(!/[.。]\s*$/.test(heading[2]), `404.html: <h${heading[1]}> must not end with a full stop: ${heading[2].trim()}`);
}
check(notFound.includes('<a class="button button-primary" href="/" lang="en" hreflang="en">English home</a>'), '404.html: must link the English home page');
check(notFound.includes('<a class="button button-secondary" href="/zh/" lang="zh-CN" hreflang="zh-CN">中文首页</a>'), '404.html: must link the Chinese home page');
check(notFound.includes('<a class="button button-secondary" href="/ja/" lang="ja" hreflang="ja">日本語ホーム</a>'), '404.html: must link the Japanese home page');
check(notFound.includes('<a class="button button-secondary" href="/ko/" lang="ko" hreflang="ko">한국어 홈</a>'), '404.html: must link the Korean home page');
check(notFound.includes('<a class="button button-secondary" href="/es/" lang="es" hreflang="es">Inicio en español</a>'), '404.html: must link the Spanish home page');
check(
  /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "3b49dd9a82634bba833340481ce6ccbe"\}'><\/script>/.test(notFound),
  '404.html: must load the Cloudflare Web Analytics beacon with the ai.speedle.io token'
);
for (const link of notFound.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
  checkInternalUrl(link[1], '404.html', `${origin}/404.html`);
}

const ogImage = join(root, 'assets/og-image.png');
check(existsSync(ogImage), 'assets/og-image.png is missing');
if (existsSync(ogImage)) {
  const png = readFileSync(ogImage);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  check(width === 1200 && height === 630, `assets/og-image.png must be 1200x630 (is ${width}x${height})`);
}

// --- home pages -----------------------------------------------------------

// The full SPDL examples moved to the patterns pages; the home page keeps one
// representative rule per area and links to the full examples.
for (const [html, file] of [[englishHtml, 'index.html'], [chineseHtml, 'zh/index.html'], [japaneseHtml, 'ja/index.html'], [koreanHtml, 'ko/index.html'], [spanishHtml, 'es/index.html']]) {
  check(!/<pre\b[^>]*data-spdl=/.test(html), `${file}: full SPDL examples belong on the patterns page`);
}
check(englishHtml.includes('href="/patterns/"'), 'index.html must link the English patterns page');
check(chineseHtml.includes('href="/zh/patterns/"'), 'zh/index.html must link the Chinese patterns page');
check(japaneseHtml.includes('href="/ja/patterns/"'), 'ja/index.html must link the Japanese patterns page');
check(koreanHtml.includes('href="/ko/patterns/"'), 'ko/index.html must link the Korean patterns page');
check(spanishHtml.includes('href="/es/patterns/"'), 'es/index.html must link the Spanish patterns page');

check(englishPatternsHtml.includes('href="/"'), 'patterns/index.html must link the English home page');
check(chinesePatternsHtml.includes('href="/zh/"'), 'zh/patterns/index.html must link the Chinese home page');
check(japanesePatternsHtml.includes('href="/ja/"'), 'ja/patterns/index.html must link the Japanese home page');
check(koreanPatternsHtml.includes('href="/ko/"'), 'ko/patterns/index.html must link the Korean home page');
check(spanishPatternsHtml.includes('href="/es/"'), 'es/patterns/index.html must link the Spanish home page');

// Each repeated idea appears once on the home page. The concept diagram keeps
// one copy of the identity and diagnose lines; the boundary card keeps the
// prompt-injection line; the risk card keeps the veto line.
for (const [html, file, phrases] of [
  [englishHtml, 'index.html', {
    'Speedle decides on the principals it is given': 1,
    'does not detect prompt injection': 1,
    'Every decision can be explained with Speedle’s diagnose API': 1,
    'Policy keeps the veto': 1
  }],
  [chineseHtml, 'zh/index.html', {
    'Speedle 根据这些主体决策': 1,
    '不检测提示词注入': 1,
    '诊断 API 说明每项决策': 1,
    '策略保留否决权': 1
  }],
  [japaneseHtml, 'ja/index.html', {
    'Speedle は渡されたプリンシパルに基づいて決定': 1,
    'プロンプトインジェクションの検出': 1,
    'すべての決定は Speedle の diagnose API で説明できます': 1,
    'ポリシーが拒否権を保持': 1
  }],
  [koreanHtml, 'ko/index.html', {
    'Speedle은 전달받은 주체에 따라 결정을 내립니다': 1,
    '프롬프트 주입을 탐지하거나': 1,
    '모든 결정은 Speedle의 diagnose API로 설명할 수 있습니다': 1,
    '정책이 거부권을 유지': 1
  }],
  [spanishHtml, 'es/index.html', {
    'Speedle decide sobre las entidades principales que recibe': 1,
    'Speedle no detecta la inyección de prompts': 1,
    'Cada decisión se puede explicar con la API diagnose de Speedle': 1,
    'La política mantiene el veto': 1
  }]
]) {
  for (const [phrase, expected] of Object.entries(phrases)) {
    const found = count(html, phrase);
    check(found === expected, `${file}: "${phrase}" must appear ${expected} time(s) (found ${found})`);
  }
}

const englishDiagramLabels = ['IDENTITY IN', 'BUILD', 'RUN', 'AUDIT &amp; EXPLAIN OUT'];
for (const label of englishDiagramLabels) {
  check(englishHtml.includes(`>${label}</text>`), `index.html concept diagram is missing the label "${label}"`);
}
for (const label of ['身份输入', '构建', '运行', '策略决策点', '审计与解释输出', '数据与训练', '模型发布']) {
  check(chineseHtml.includes(`>${label}</text>`), `zh/index.html concept diagram is missing the Chinese label "${label}"`);
}
for (const [html, file, tag, title] of [
  [englishHtml, 'index.html', 'Boundary', 'Where Speedle stops'],
  [chineseHtml, 'zh/index.html', '边界', 'Speedle 的能力边界'],
  [japaneseHtml, 'ja/index.html', '境界', 'Speedle の適用範囲'],
  [koreanHtml, 'ko/index.html', '경계', 'Speedle의 경계'],
  [spanishHtml, 'es/index.html', 'Límite', 'Dónde se detiene Speedle']
]) {
  check(html.includes(`<p class="crosscut-tag">${tag}</p>`), `${file}: the cross-cutting row must have a boundary card tagged "${tag}"`);
  check(html.includes(`>${title}<`), `${file}: the boundary card must be titled "${title}"`);
}

for (const keyword of ['zero standing privileges', 'ZSP']) {
  check(englishHtml.includes(keyword), `index.html must naturally include the English keyword "${keyword}"`);
}
for (const keyword of ['AI 智能体授权', 'AI 访问控制', 'MCP 授权', 'RAG 权限控制', '大模型应用权限管理', '智能体最小权限', '零常驻权限', 'ZSP', '用 AI 管权限，用策略约束 AI', 'Speedle MCP：两种独立模式']) {
  check(chineseHtml.includes(keyword), `zh/index.html must naturally include the Chinese keyword "${keyword}"`);
}
check(chineseHtml.includes('>产品<svg class="products-chevron"'), 'zh/index.html header must use the Chinese 产品 label');
check(japaneseHtml.includes('>プロダクト<svg class="products-chevron"'), 'ja/index.html header must use the Japanese プロダクト label');
check(koreanHtml.includes('>제품<svg class="products-chevron"'), 'ko/index.html header must use the Korean 제품 label');
check(spanishHtml.includes('>Productos<svg class="products-chevron"'), 'es/index.html header must use the Spanish Productos label');

for (const [html, file, footerLabel] of [
  [englishHtml, 'index.html', 'Speedle products'],
  [chineseHtml, 'zh/index.html', 'Speedle 产品'],
  [japaneseHtml, 'ja/index.html', 'Speedle プロダクト'],
  [koreanHtml, 'ko/index.html', 'Speedle 제품'],
  [spanishHtml, 'es/index.html', 'Productos Speedle'],
  [englishPatternsHtml, 'patterns/index.html', 'Speedle products'],
  [chinesePatternsHtml, 'zh/patterns/index.html', 'Speedle 产品'],
  [japanesePatternsHtml, 'ja/patterns/index.html', 'Speedle プロダクト'],
  [koreanPatternsHtml, 'ko/patterns/index.html', 'Speedle 제품'],
  [spanishPatternsHtml, 'es/patterns/index.html', 'Productos Speedle']
]) {
  const footerFamily = (html.match(/<nav class="footer-family"[\s\S]*?<\/nav>/) || [])[0] || '';
  check(footerFamily.startsWith(`<nav class="footer-family" aria-label="${footerLabel}">`), `${file}: footer product navigation must use its localized accessible label`);
  check(!/<h[1-6]\b/.test(footerFamily), `${file}: footer products must not have a column heading`);
  check((footerFamily.match(/<li>/g) || []).length === 3, `${file}: footer must contain exactly three product links`);
}

// --- patterns pages: SPDL examples ----------------------------------------

// The tested SPDL sources, including their comments, must not diverge in translation.
function spdlBlocks(html) {
  return new Map([...html.matchAll(/<pre\b[^>]*data-spdl="([^"]+)"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)]
    .map(match => [match[1], match[2]]));
}
const englishSpdl = spdlBlocks(englishPatternsHtml);
const chineseSpdl = spdlBlocks(chinesePatternsHtml);
const japaneseSpdl = spdlBlocks(japanesePatternsHtml);
const koreanSpdl = spdlBlocks(koreanPatternsHtml);
const spanishSpdl = spdlBlocks(spanishPatternsHtml);

check(englishSpdl.size === 7, `patterns/index.html must contain seven SPDL examples (found ${englishSpdl.size})`);
for (const name of ['training', 'release', 'rag', 'agents', 'mcp', 'a2a', 'zsp']) {
  check(englishSpdl.has(name), `patterns/index.html is missing the ${name} SPDL example`);
}
for (const [lang, spdlMap] of [
  ['zh/patterns/index.html', chineseSpdl],
  ['ja/patterns/index.html', japaneseSpdl],
  ['ko/patterns/index.html', koreanSpdl],
  ['es/patterns/index.html', spanishSpdl]
]) {
  check(spdlMap.size === englishSpdl.size, `${lang} must contain the same number of SPDL examples`);
  for (const [name, source] of englishSpdl) {
    check(spdlMap.has(name), `${lang} is missing the ${name} SPDL example`);
    check(spdlMap.get(name) === source, `${lang} ${name} SPDL must be byte-identical, including comments`);
  }
}

function decodeSpdl(source) {
  return source
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

// Each representative rule on a home page is an exact line from its tested
// sample, and both home pages carry the same rules in the same order.
function representativeRules(html) {
  return [...html.matchAll(/<article id="([^"]+)" class="pattern-card">[\s\S]*?<code class="pattern-rule">([\s\S]*?)<\/code>/g)]
    .map(match => ({ id: match[1], rule: match[2] }));
}
const cardSamples = {
  'lc-data': 'training',
  'lc-release': 'release',
  'lc-rag': 'rag',
  'lc-agents': 'agents',
  'lc-mcp': 'mcp',
  'lc-a2a': 'a2a',
  zsp: 'zsp'
};
const englishRules = representativeRules(englishHtml);
const chineseRules = representativeRules(chineseHtml);
const japaneseRules = representativeRules(japaneseHtml);
const koreanRules = representativeRules(koreanHtml);
const spanishRules = representativeRules(spanishHtml);

check(englishRules.length === 7, `index.html must show one representative rule per area (found ${englishRules.length})`);
for (const [lang, rules] of [
  ['zh/index.html', chineseRules],
  ['ja/index.html', japaneseRules],
  ['ko/index.html', koreanRules],
  ['es/index.html', spanishRules]
]) {
  check(rules.length === englishRules.length, `${lang} must show the same number of representative rules`);
}

for (const [index, { id, rule }] of englishRules.entries()) {
  const sampleName = cardSamples[id];
  check(sampleName !== undefined, `index.html: unexpected representative-rule card "${id}"`);
  if (sampleName) {
    const sample = read(`samples/page-examples/${sampleName}/${sampleName}.spdl`);
    check(sample.split('\n').includes(decodeSpdl(rule)), `index.html: the ${id} representative rule must be an exact line from ${sampleName}.spdl`);
  }
  for (const [lang, rules] of [
    ['zh/index.html', chineseRules],
    ['ja/index.html', japaneseRules],
    ['ko/index.html', koreanRules],
    ['es/index.html', spanishRules]
  ]) {
    const r = rules[index];
    check(r !== undefined && r.id === id && r.rule === rule, `${lang}: the ${id} representative rule must match index.html byte-for-byte`);
  }
}
for (const [name, source] of englishSpdl) {
  const samplePath = `samples/page-examples/${name}/${name}.spdl`;
  const pageExample = read(samplePath).replace(/\n$/, '');
  check(pageExample === decodeSpdl(source), `${samplePath} must be byte-identical to the ${name} SPDL example on patterns/index.html`);
}

// The ZSP example must cover the complete time checks and the read-only status
// function, and its comments must use "#" only. The source is HTML-escaped
// inside <code>, so decode the entities before checking.
const zspSource = decodeSpdl(englishSpdl.get('zsp') || '');
for (const fragment of [
  'expires_at > issued_at',
  'expires_at - issued_at <= 600',
  'issued_at <= request_time + 60',
  'not_before <= request_time + 60',
  'request_time < expires_at',
  'TokenUnused(token_id)'
]) {
  check(zspSource.includes(fragment), `zsp SPDL example must include "${fragment}"`);
}
check(!/consume/i.test(zspSource), 'zsp SPDL example must keep the policy function read-only: no consume');
for (const line of zspSource.split('\n')) {
  const trimmed = line.trim();
  check(!/^(\/\/|\/\*|\*)/.test(trimmed), `zsp SPDL comments must use "#" only: ${trimmed}`);
}
const sampleSpdl = read('samples/zsp/zsp.spdl').replace(/\n$/, '');
check(sampleSpdl === zspSource, 'samples/zsp/zsp.spdl must match the zsp SPDL example on patterns/index.html');
const sampleLink = 'https://github.com/teramoby/ai.speedle.io/tree/main/samples/zsp';
for (const [html, label] of [
  [englishPatternsHtml, 'patterns/index.html'],
  [chinesePatternsHtml, 'zh/patterns/index.html'],
  [japanesePatternsHtml, 'ja/patterns/index.html'],
  [koreanPatternsHtml, 'ko/patterns/index.html'],
  [spanishPatternsHtml, 'es/patterns/index.html']
]) {
  check(html.includes(`href="${sampleLink}"`), `${label} must link the samples/zsp runnable sample`);
}
check(englishPatternsHtml.includes('Zero standing privileges · Self-hosted'), 'patterns/index.html ZSP block must present the pattern as self-hosted Speedle');
check(chinesePatternsHtml.includes('零常驻权限 · 自托管'), 'zh/patterns/index.html ZSP block must present the pattern as self-hosted Speedle');
check(japanesePatternsHtml.includes('常設特権ゼロ · セルフホスト'), 'ja/patterns/index.html ZSP block must present the pattern as self-hosted Speedle');
check(koreanPatternsHtml.includes('상시 권한 배제 · 자체 호스팅'), 'ko/patterns/index.html ZSP block must present the pattern as self-hosted Speedle');
check(spanishPatternsHtml.includes('Privilegios permanentes cero · Autohospedado'), 'es/patterns/index.html ZSP block must present the pattern as self-hosted Speedle');

check(englishPatternsHtml.includes('Just-in-time tokens support a zero standing privileges pattern'), 'patterns/index.html ZSP title must present ZSP as a pattern');
check(chinesePatternsHtml.includes('即时令牌支撑零常驻权限模式'), 'zh/patterns/index.html ZSP title must present ZSP as a pattern');
check(japanesePatternsHtml.includes('ジャストインタイムトークンが常設特権ゼロパターンを支える'), 'ja/patterns/index.html ZSP title must present ZSP as a pattern');
check(koreanPatternsHtml.includes('적시 토큰으로 상시 권한 배제 패턴을 지원'), 'ko/patterns/index.html ZSP title must present ZSP as a pattern');
check(spanishPatternsHtml.includes('Los tokens Just-in-Time respaldan un patrón de privilegios permanentes cero'), 'es/patterns/index.html ZSP title must present ZSP as a pattern');

check(englishPatternsHtml.includes('Under the right issuance and control conditions'), 'patterns/index.html ZSP copy must scope the claim to the right conditions');
check(chinesePatternsHtml.includes('签发和管控到位时'), 'zh/patterns/index.html ZSP copy must scope the claim to the right conditions');
check(japanesePatternsHtml.includes('適切な発行および管理条件のもとで'), 'ja/patterns/index.html ZSP copy must scope the claim to the right conditions');
check(koreanPatternsHtml.includes('올바른 발급 및 통제 조건 하에서'), 'ko/patterns/index.html ZSP copy must scope the claim to the right conditions');
check(spanishPatternsHtml.includes('Bajo las condiciones adecuadas de emisión y control'), 'es/patterns/index.html ZSP copy must scope the claim to the right conditions');

check(englishPatternsHtml.includes('production also needs a trusted component'), 'patterns/index.html ZSP copy must state the production verification requirement');
check(chinesePatternsHtml.includes('生产环境还需要可信组件'), 'zh/patterns/index.html ZSP copy must state the production verification requirement');
check(japanesePatternsHtml.includes('本番環境には信頼できるコンポーネントも必要'), 'ja/patterns/index.html ZSP copy must state the production verification requirement');
check(koreanPatternsHtml.includes('프로덕션 환경에는 신뢰할 수 있는 컴포넌트도 필요'), 'ko/patterns/index.html ZSP copy must state the production verification requirement');
check(spanishPatternsHtml.includes('la producción también necesita un componente de confianza'), 'es/patterns/index.html ZSP copy must state the production verification requirement');

check(englishPatternsHtml.includes('atomic consume'), 'patterns/index.html ZSP copy must state the atomic consume requirement');
check(chinesePatternsHtml.includes('原子消费'), 'zh/patterns/index.html ZSP copy must state the atomic consume requirement');
check(japanesePatternsHtml.includes('アトミックな消費'), 'ja/patterns/index.html ZSP copy must state the atomic consume requirement');
check(koreanPatternsHtml.includes('원자적 소비'), 'ko/patterns/index.html ZSP copy must state the atomic consume requirement');
check(spanishPatternsHtml.includes('consumo atómico'), 'es/patterns/index.html ZSP copy must state the atomic consume requirement');

for (const [html, label] of [
  [englishPatternsHtml, 'patterns/index.html'],
  [chinesePatternsHtml, 'zh/patterns/index.html'],
  [japanesePatternsHtml, 'ja/patterns/index.html'],
  [koreanPatternsHtml, 'ko/patterns/index.html'],
  [spanishPatternsHtml, 'es/patterns/index.html']
]) {
  check(!html.includes('A token for each request, not a standing privilege'), `${label} must not use the old ZSP title`);
  check(!html.includes('每次请求一个令牌，不留常驻权限'), `${label} must not use the old ZSP title`);
}
const sampleReadme = read('samples/zsp/README.md');
check(/^## Production requirements$/m.test(sampleReadme), 'samples/zsp/README.md must have a Production requirements section');
check(sampleReadme.includes('not a security guarantee'), 'samples/zsp/README.md must state that the sample is not a security guarantee');
for (const keyword of ['SPDL', 'permission-aware RAG', 'zero standing privileges', 'MCP', 'A2A']) {
  check(englishPatternsHtml.includes(keyword), `patterns/index.html must naturally include the keyword "${keyword}"`);
}
for (const keyword of ['SPDL 示例', '数据与训练', '零常驻权限', 'AI 风险检测', '权限感知的 RAG']) {
  check(chinesePatternsHtml.includes(keyword), `zh/patterns/index.html must naturally include the Chinese keyword "${keyword}"`);
}

// --- Claude Code plugin installation -------------------------------------

const readme = read('README.md');
const claudePluginClaims = [
  'claude plugin marketplace add teramoby/ai.speedle.io',
  'claude plugin install speedle@speedle',
  '/plugin configure speedle@speedle',
  '/speedle:speedle-policy-modeler'
];
for (const [text, file] of [
  [englishHtml, 'index.html'],
  [chineseHtml, 'zh/index.html'],
  [japaneseHtml, 'ja/index.html'],
  [koreanHtml, 'ko/index.html'],
  [spanishHtml, 'es/index.html'],
  [readme, 'README.md']
]) {
  for (const claim of claudePluginClaims) {
    check(text.includes(claim), `${file} must include the Claude Code plugin instruction "${claim}"`);
  }
}
for (const claim of [
  'claude plugin marketplace update speedle',
  'claude plugin update speedle@speedle',
  'claude plugin install speedle-manage@speedle',
  'Third-party marketplaces do not auto-update by default'
]) {
  check(readme.includes(claim), `README.md must include the Claude Code plugin instruction "${claim}"`);
}

// --- llms.txt and llms-full.txt ------------------------------------------

// The canonical product definition shared by the three Speedle sites. It must
// appear verbatim in both files, and the same claims must be true on the page.
const SPEEDLE_DEFINITION = 'Speedle is an open-source (UPL-1.0) authorization engine with the SPDL policy language. It consists of ADS (decisions) and PMS (policy management), SDKs in six languages, Speedle Cloud (hosted), and Speedle AI (authorization for and with AI agents, an MCP server, and the policy-modeler skill).';
const SITE_DEFINITION = 'Speedle AI — AI for access control, access control for AI';

const llms = read('llms.txt');
check(/^# .+/m.test(llms), 'llms.txt must start with an H1');
check(/^> .+/m.test(llms), 'llms.txt must have a blockquote summary');
check(llms.startsWith(`# Speedle AI\n\n> ${SPEEDLE_DEFINITION}`), 'llms.txt must open with the canonical Speedle definition in its blockquote');
check(llms.includes(SITE_DEFINITION), 'llms.txt must state the Speedle AI definition');
check(englishHtml.includes(SITE_DEFINITION), 'index.html must state the Speedle AI definition used by the llms files');
check(/\n## /.test(llms), 'llms.txt must have link sections');
check(llms.includes('](https://ai.speedle.io/zh/)'), 'llms.txt must include a 中文 link to the Chinese home page');
check(llms.includes('](https://ai.speedle.io/ja/)'), 'llms.txt must link the Japanese home page');
check(llms.includes('](https://ai.speedle.io/ko/)'), 'llms.txt must link the Korean home page');
check(llms.includes('](https://ai.speedle.io/es/)'), 'llms.txt must link the Spanish home page');
check(llms.includes('(https://ai.speedle.io/patterns/)'), 'llms.txt must link the patterns page');
check(llms.includes('(https://ai.speedle.io/zh/patterns/)'), 'llms.txt must link the Chinese patterns page');
check(llms.includes('(https://ai.speedle.io/ja/patterns/)'), 'llms.txt must link the Japanese patterns page');
check(llms.includes('(https://ai.speedle.io/ko/patterns/)'), 'llms.txt must link the Korean patterns page');
check(llms.includes('(https://ai.speedle.io/es/patterns/)'), 'llms.txt must link the Spanish patterns page');
check(llms.includes('(https://engine.speedle.io/llms.txt)'), 'llms.txt must cross-link the Engine llms.txt');
check(llms.includes('(https://cloud.speedle.io/llms.txt)'), 'llms.txt must cross-link the Cloud llms.txt');
const llmsLinks = [...llms.matchAll(/\]\((https:\/\/[^)\s]*)\)/g)].map(match => match[1]);
check(llmsLinks.length > 0, 'llms.txt must link to the site');
for (const link of llmsLinks) checkInternalUrl(link, 'llms.txt');

const llmsFull = read('llms-full.txt');
check(llmsFull.length > 0, 'llms-full.txt must not be empty');
check(llmsFull.startsWith('# Speedle AI'), 'llms-full.txt must start with the site H1');
check(llmsFull.includes(SPEEDLE_DEFINITION), 'llms-full.txt must state the canonical Speedle definition');
check(llmsFull.includes(SITE_DEFINITION), 'llms-full.txt must state the Speedle AI definition');
check(llmsFull.includes('https://engine.speedle.io/llms.txt'), 'llms-full.txt must cross-link the Engine llms.txt');
check(llmsFull.includes('https://cloud.speedle.io/llms.txt'), 'llms-full.txt must cross-link the Cloud llms.txt');
const fullUrls = [...llmsFull.matchAll(/https:\/\/ai\.speedle\.io\/[^\s)"'>]*/g)].map(match => match[0]);
for (const url of fullUrls) checkInternalUrl(url, 'llms-full.txt');

// Every claim that constrains the files must also hold on the page.
const syncedClaims = [
  ['0.2.0', 'the SDK version'],
  ['published on npm', 'the npm publication status'],
  ['npm install @speedle/mcp', 'the Speedle MCP install command'],
  ['npm install @speedle/sdk', 'the Speedle SDK install command'],
  ['not a shipped feature', 'the AI risk-detection status'],
  ['37 authorization cases', 'the policy-modeler example results']
];
for (const [claim, label] of syncedClaims) {
  check(englishHtml.includes(claim), `index.html must support ${label} ("${claim}")`);
  check(llmsFull.includes(claim), `llms-full.txt must state ${label} ("${claim}")`);
}
check(llms.includes('npm install @speedle/mcp'), 'llms.txt must give the @speedle/mcp install command');
check(llms.includes('npm install @speedle/sdk'), 'llms.txt must give the @speedle/sdk install command');
check(llms.includes('published on npm'), 'llms.txt must state that the npm packages are published');
check(llmsFull.includes('claude plugin marketplace add teramoby/ai.speedle.io'), 'llms-full.txt must include the Claude Code marketplace command');
check(llmsFull.includes('claude plugin install speedle@speedle'), 'llms-full.txt must include the Claude Code plugin install command');
check(chineseHtml.includes('npm install @speedle/mcp'), 'zh/index.html must show the @speedle/mcp install command');
check(chineseHtml.includes('npm install @speedle/sdk'), 'zh/index.html must show the @speedle/sdk install command');
check(chineseHtml.includes('已在 npm 发布'), 'zh/index.html must state that the npm packages are published');
for (const [text, file] of [[englishHtml, 'index.html'], [llms, 'llms.txt'], [llmsFull, 'llms-full.txt'], [readme, 'README.md']]) {
  check(!text.includes('not published'), `${file} must not say the npm packages are unpublished`);
  check(!text.includes('Available at launch'), `${file} must not mark MCP install examples as future`);
}
check(!chineseHtml.includes('目前尚未发布'), 'zh/index.html must not say @speedle/mcp is unpublished');
check(!englishHtml.includes('speedle-mcp/issues/1'), 'index.html must not link the closed check-mode issue');
check(!englishHtml.includes('speedle-mcp/issues/2'), 'index.html must not link the closed manage-mode issue');
check(!chineseHtml.includes('speedle-mcp/issues/1'), 'zh/index.html must not link the closed check-mode issue');
check(!chineseHtml.includes('speedle-mcp/issues/2'), 'zh/index.html must not link the closed manage-mode issue');
check(llms.includes('opens soon'), 'llms.txt must state that Speedle Cloud sign-in opens soon');
check(llmsFull.includes('opens soon'), 'llms-full.txt must state that Speedle Cloud sign-in opens soon');

// Every link in the llms files is absolute and live. Local ai.speedle.io links
// are already checked against repository files and anchors above; external
// links are fetched here and must answer 200 without a redirect.
for (const [file, text] of [['llms.txt', llms], ['llms-full.txt', llmsFull]]) {
  check(!/\]\((?!https:\/\/)/.test(text), `${file}: every Markdown link must be an absolute https URL`);
  check(!/http:\/\//.test(text), `${file}: links must use https`);
}
const externalUrls = new Set();
for (const text of [llms, llmsFull]) {
  for (const match of text.matchAll(/https:\/\/[^\s)\]"'<>]+/g)) {
    const url = match[0].replace(/[.,;:]+$/, '');
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      check(false, `llms: invalid URL ${url}`);
      continue;
    }
    if (parsed.origin !== origin) externalUrls.add(url);
  }
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// GitHub's HTML pages intermittently answer 5xx to automated clients while the
// repository itself stays reachable. When a github.com page is unavailable,
// verify the same target through the GitHub API so the check tests the link
// target rather than GitHub's HTML edge.
function githubApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'github.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return null;
  const [owner, repo, kind, ...rest] = parts;
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
  if (parts.length === 2) return repoApi;
  if (kind === 'issues') {
    const number = rest[0] && /^\d+$/.test(rest[0]) ? `/${rest[0]}` : '';
    return `${repoApi}/issues${number}`;
  }
  if ((kind === 'tree' || kind === 'blob') && rest.length >= 2) {
    const [ref, ...path] = rest;
    return `${repoApi}/contents/${path.map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
  }
  return repoApi;
}

async function httpStatus(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; ai.speedle.io link check)' }
      });
      if (response.body) await response.body.cancel();
      if (response.status === 429 || response.status >= 500) {
        await sleep(attempt * 1500);
        continue;
      }
      return response.status;
    } catch (error) {
      if (attempt === 3) return `fetch error: ${error.message}`;
      await sleep(attempt * 1500);
    }
  }
  return 'unreachable';
}

async function liveStatus(url) {
  const status = await httpStatus(url);
  if (status === 200) return 200;
  const api = githubApiUrl(url);
  if (api) {
    const apiStatus = await httpStatus(api);
    if (apiStatus === 200) return '200 (GitHub API target)';
  }
  return status;
}

const liveUrls = [...externalUrls].sort();
for (let index = 0; index < liveUrls.length; index += 6) {
  const batch = liveUrls.slice(index, index + 6);
  const statuses = await Promise.all(batch.map(liveStatus));
  statuses.forEach((status, batchIndex) => {
    const reachable = status === 200 || status === '200 (GitHub API target)';
    check(reachable, `${batch[batchIndex]} from llms.txt/llms-full.txt must return 200 without a redirect (got ${status})`);
  });
}

// Every sitemap location and llms link must use the canonical host.
for (const url of [...locations, ...llmsLinks]) {
  check(!url.includes('www.'), `${url} must not use a www host`);
}

// --- report ---------------------------------------------------------------

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} of ${checks} checks failed\n`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`PASS: ${checks} SEO/GEO checks passed`);
console.log(`- sitemap.xml: ${locations.length} URLs, hreflang ${[...new Set(sitemapAlternates.map(alt => alt.lang))].join(', ')}`);
console.log(`- robots.txt: ${robots.split('\n').filter(line => line.startsWith('User-agent:')).length} user-agent groups, sitemap referenced`);
console.log(`- llms.txt: ${llmsLinks.length} links; llms-full.txt: ${fullUrls.length} internal URLs; ${liveUrls.length} external links live-checked`);
for (const report of pageReports) {
  console.log(`- ${report.file}: title ${report.titleLength} chars, description ${report.descriptionLength} chars, ${report.nodes} JSON-LD nodes`);
}
console.log(`- SPDL parity: ${englishSpdl.size} byte-identical examples, comments included`);

#!/usr/bin/env node
// Checks the hand-maintained SEO/GEO files and both localized home pages.
//
// No dependencies. Run from anywhere:
//   node scripts/check-seo.mjs
//
// It verifies sitemap and llms link targets, hreflang alternates, page metadata,
// JSON-LD and the absence of FAQ content, the language switch, Cloudflare Web
// Analytics, headline punctuation, and byte-identical SPDL examples across the
// English and Chinese pages.

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
function localTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
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

function checkInternalUrl(url, source) {
  const target = localTarget(url);
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
    parsed = new URL(url);
  } catch {
    return;
  }
  check(parsed.protocol === 'https:' || parsed.protocol === 'mailto:', `${source}: ${url} must use https`);
}

// --- robots.txt -----------------------------------------------------------

const robots = read('robots.txt');
check(/^User-agent: \*$/m.test(robots), 'robots.txt must have a "User-agent: *" group');
check(/^Allow: \/$/m.test(robots), 'robots.txt must allow public pages');
check(/^Sitemap: https:\/\/ai\.speedle\.io\/sitemap\.xml$/m.test(robots), 'robots.txt must reference https://ai.speedle.io/sitemap.xml');
check(!/^Disallow: \/$/m.test(robots), 'robots.txt must not disallow the whole site');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']) {
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
check(locations.length === 2, `sitemap.xml must contain the English and Chinese URLs (found ${locations.length})`);
for (const path of ['/', '/zh/']) {
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

const expectedAlternates = {
  en: `${origin}/`,
  'zh-CN': `${origin}/zh/`,
  'x-default': `${origin}/`
};
const pageDefinitions = [
  {
    file: 'index.html',
    canonical: `${origin}/`,
    language: 'en',
    languageSwitch: '<a href="/zh/" lang="zh-CN" hreflang="zh-CN" aria-label="切换到中文">中文</a>'
  },
  {
    file: 'zh/index.html',
    canonical: `${origin}/zh/`,
    language: 'zh-CN',
    languageSwitch: '<a href="/" lang="en" hreflang="en" aria-label="Switch to English">English</a>'
  }
];
const pageReports = [];

function checkPage(definition) {
  const { file, canonical, language, languageSwitch } = definition;
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
  for (const [lang, href] of Object.entries(expectedAlternates)) {
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
  check(html.includes(languageSwitch), `${file}: missing the correct language-switch link`);
  check(new RegExp(`${languageSwitch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</nav>`).test(html), `${file}: language switch must be the last navigation item`);
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
  if (language === 'zh-CN') {
    check(software && software.inLanguage === 'zh-CN', `${file}: SoftwareApplication must declare inLanguage="zh-CN"`);
  }

  // Neither localized home has a FAQ or structured data for one.
  check(!graph.some(node => node['@type'] === 'FAQPage'), `${file}: must not include FAQPage JSON-LD`);
  check(!/<section\b[^>]*\bid=["']faq["']/.test(html), `${file}: must not have a visible FAQ section`);
  pageReports.push({ file, titleLength: title.length, descriptionLength: description.length, nodes: graph.length });
  return html;
}

const englishHtml = checkPage(pageDefinitions[0]);
const chineseHtml = checkPage(pageDefinitions[1]);

const ogImage = join(root, 'assets/og-image.png');
check(existsSync(ogImage), 'assets/og-image.png is missing');
if (existsSync(ogImage)) {
  const png = readFileSync(ogImage);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  check(width === 1200 && height === 630, `assets/og-image.png must be 1200x630 (is ${width}x${height})`);
}

// The tested SPDL sources, including their comments, must not diverge in translation.
function spdlBlocks(html) {
  return new Map([...html.matchAll(/<pre\b[^>]*data-spdl="([^"]+)"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)]
    .map(match => [match[1], match[2]]));
}
const englishSpdl = spdlBlocks(englishHtml);
const chineseSpdl = spdlBlocks(chineseHtml);
check(englishSpdl.size === 6, `index.html must contain six SPDL examples (found ${englishSpdl.size})`);
check(chineseSpdl.size === englishSpdl.size, 'zh/index.html must contain the same number of SPDL examples');
for (const [name, source] of englishSpdl) {
  check(chineseSpdl.has(name), `zh/index.html is missing the ${name} SPDL example`);
  check(chineseSpdl.get(name) === source, `zh/index.html ${name} SPDL must be byte-identical, including comments`);
}
for (const label of ['身份输入', '构建', '运行', '策略决策点', '审计与解释输出', '边界', '数据与训练', '模型发布']) {
  check(chineseHtml.includes(`>${label}</text>`), `zh/index.html concept diagram is missing the Chinese label "${label}"`);
}
for (const keyword of ['AI 智能体授权', 'AI 访问控制', 'MCP 授权', 'RAG 权限控制', '大模型应用权限管理', '智能体最小权限', 'AI 智能体授权：用 AI 管权限，用策略约束 AI', 'Speedle MCP：两种独立模式']) {
  check(chineseHtml.includes(keyword), `zh/index.html must naturally include the Chinese keyword "${keyword}"`);
}
check(chineseHtml.includes('>产品<svg class="products-chevron"'), 'zh/index.html header must use the Chinese 产品 label');
check(chineseHtml.includes('<h2 id="footer-family-title">Speedle 产品</h2>'), 'zh/index.html footer must use the Speedle 产品 label');

// --- llms.txt and llms-full.txt ------------------------------------------

const llms = read('llms.txt');
check(/^# .+/m.test(llms), 'llms.txt must start with an H1');
check(/^> .+/m.test(llms), 'llms.txt must have a blockquote summary');
check(/\n## /.test(llms), 'llms.txt must have link sections');
check(llms.includes('[中文](https://ai.speedle.io/zh/)'), 'llms.txt must include a 中文 link to the Chinese home page');
const llmsLinks = [...llms.matchAll(/\]\((https:\/\/ai\.speedle\.io\/[^)\s]*)\)/g)].map(match => match[1]);
check(llmsLinks.length > 0, 'llms.txt must link to the site');
for (const link of llmsLinks) checkInternalUrl(link, 'llms.txt');

const llmsFull = read('llms-full.txt');
check(llmsFull.length > 0, 'llms-full.txt must not be empty');
const fullUrls = [...llmsFull.matchAll(/https:\/\/ai\.speedle\.io\/[^\s)"'>]*/g)].map(match => match[0]);
for (const url of fullUrls) checkInternalUrl(url, 'llms-full.txt');

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
console.log(`- llms.txt: ${llmsLinks.length} internal links; llms-full.txt: ${fullUrls.length} internal URLs`);
for (const report of pageReports) {
  console.log(`- ${report.file}: title ${report.titleLength} chars, description ${report.descriptionLength} chars, ${report.nodes} JSON-LD nodes`);
}
console.log(`- SPDL parity: ${englishSpdl.size} byte-identical examples, comments included`);

#!/usr/bin/env node
// Checks the hand-maintained SEO/GEO files: robots.txt, sitemap.xml, llms.txt,
// llms-full.txt and the page metadata in index.html.
//
// No dependencies. Run from anywhere:
//   node scripts/check-seo.mjs
//
// It verifies the sitemap and llms link targets resolve to files in this
// repository, that hreflang alternates agree with the page, and that the
// JSON-LD blocks parse and match the visible FAQ.

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
// fragment URLs, to an id in that file.
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
  const file = path === '/' || path === '' ? 'index.html' : path.replace(/^\//, '');
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
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
check(locations.length > 0, 'sitemap.xml must contain at least one <loc>');
for (const loc of locations) {
  check(loc.startsWith(`${origin}/`), `sitemap.xml: ${loc} must be on ${origin}`);
  const target = localTarget(loc);
  check(target !== null && htmlFor(target.file) !== '', `sitemap.xml: ${loc} has no local page`);
  const entry = sitemap.slice(sitemap.indexOf(`<loc>${loc}</loc>`));
  const block = entry.slice(0, entry.indexOf('</url>'));
  check(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(block), `sitemap.xml: ${loc} needs a <lastmod>`);
}
const sitemapAlternates = [...sitemap.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)]
  .map(match => ({ lang: match[1], href: match[2] }));
for (const alt of sitemapAlternates) checkInternalUrl(alt.href, 'sitemap.xml hreflang');

// --- page metadata --------------------------------------------------------

const html = read('index.html');
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
check(title.length > 0 && title.length <= 60, `title must be 1-60 characters (is ${title.length})`);
check(description.length > 0 && description.length <= 155, `meta description must be 1-155 characters (is ${description.length})`);
check(/<link rel="canonical" href="https:\/\/ai\.speedle\.io\/">/.test(html), 'canonical URL must be https://ai.speedle.io/');
const pageAlternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
  .map(match => ({ lang: match[1], href: match[2] }));
for (const lang of ['en', 'x-default']) {
  const pageAlt = pageAlternates.find(alt => alt.lang === lang);
  const mapAlt = sitemapAlternates.find(alt => alt.lang === lang);
  check(pageAlt !== undefined, `index.html must declare hreflang="${lang}"`);
  check(mapAlt !== undefined, `sitemap.xml must declare hreflang="${lang}"`);
  check(pageAlt && mapAlt && pageAlt.href === mapAlt.href, `hreflang="${lang}" must match between index.html and sitemap.xml`);
}
check((html.match(/<h1[\s>]/g) || []).length === 1, 'index.html must have exactly one <h1>');
// Cloudflare Web Analytics: the public site token, cookieless, before </body>.
check(
  /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "3b49dd9a82634bba833340481ce6ccbe"\}'><\/script>/.test(html),
  'index.html must load the Cloudflare Web Analytics beacon with the ai.speedle.io token'
);
check(
  html.lastIndexOf('cloudflareinsights.com/beacon.min.js') < html.lastIndexOf('</body>'),
  'the Cloudflare Web Analytics beacon must be inside the page body'
);
check(/<meta property="og:image" content="https:\/\/ai\.speedle\.io\/assets\/og-image\.png">/.test(html), 'og:image must point at the share image');
check(/<meta name="twitter:card" content="summary_large_image">/.test(html), 'twitter:card must be summary_large_image');
const ogImage = join(root, 'assets/og-image.png');
check(existsSync(ogImage), 'assets/og-image.png is missing');
if (existsSync(ogImage)) {
  const png = readFileSync(ogImage);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  check(width === 1200 && height === 630, `assets/og-image.png must be 1200x630 (is ${width}x${height})`);
}

// --- JSON-LD --------------------------------------------------------------

const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
check(jsonLdBlocks.length > 0, 'index.html must contain JSON-LD');
const graph = [];
for (const block of jsonLdBlocks) {
  try {
    const data = JSON.parse(block);
    if (Array.isArray(data['@graph'])) graph.push(...data['@graph']);
    else graph.push(data);
  } catch (error) {
    check(false, `JSON-LD does not parse: ${error.message}`);
  }
}
for (const type of ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']) {
  check(graph.some(node => node['@type'] === type), `JSON-LD must include a ${type}`);
}
const faq = graph.find(node => node['@type'] === 'FAQPage');
const faqEntries = faq && Array.isArray(faq.mainEntity) ? faq.mainEntity : [];
check(faqEntries.length > 0, 'FAQPage must contain Question entries');
for (const entry of faqEntries) {
  check(entry['@type'] === 'Question' && typeof entry.name === 'string', 'FAQPage entries must be Questions with a name');
  check(entry.acceptedAnswer && entry.acceptedAnswer['@type'] === 'Answer' && typeof entry.acceptedAnswer.text === 'string', `FAQPage question "${entry.name}" needs an Answer`);
}

// The visible FAQ must contain the same questions and answers as the JSON-LD.
const visibleText = html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?])/g, '$1')
  .trim();
for (const entry of faqEntries) {
  check(visibleText.includes(entry.name), `visible FAQ is missing the question "${entry.name}"`);
  check(visibleText.includes(entry.acceptedAnswer.text), `visible FAQ text does not match the JSON-LD answer for "${entry.name}"`);
}

// --- llms.txt and llms-full.txt ------------------------------------------

const llms = read('llms.txt');
check(/^# .+/m.test(llms), 'llms.txt must start with an H1');
check(/^> .+/m.test(llms), 'llms.txt must have a blockquote summary');
check(/\n## /.test(llms), 'llms.txt must have link sections');
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
console.log(`- sitemap.xml: ${locations.length} URL(s), hreflang ${sitemapAlternates.map(alt => alt.lang).join(', ')}`);
console.log(`- robots.txt: ${robots.split('\n').filter(line => line.startsWith('User-agent:')).length} user-agent groups, sitemap referenced`);
console.log(`- llms.txt: ${llmsLinks.length} internal link(s); llms-full.txt: ${fullUrls.length} internal URL(s)`);
console.log(`- index.html: title ${title.length} chars, description ${description.length} chars, ${graph.length} JSON-LD node(s), ${faqEntries.length} FAQ entries`);

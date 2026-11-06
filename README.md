# Speedle for AI

Standalone public exploration website: https://ai.speedle.io

The site has two parts. AI for access management covers the Speedle MCP
launch preview and an AI-based risk-detection approach being built; risk
detection is not presented as a shipped feature and never grants access
that policy denies. Access management for AI shows policy patterns across
the AI lifecycle: model training, deployment, operations and inference,
agents, MCP tool calls and agent-to-agent calls. These are solution
patterns on the Speedle policy engine, not shipped platform integrations.
Every SPDL example on the page is parsed and evaluated with the Speedle
file store (`eval.NewFromFile`) before it is published; keep each SPDL block
byte-identical to what was tested. The Chinese page retains the same seven SPDL
blocks, including their English comments. The zero standing privileges sample
runs from `samples/zsp/`; it is not part of the sitemap.

The interactive example uses simplified
browser-local policy rules and does not simulate AI risk detection. It is
not a Speedle engine, MCP integration, RAG adapter, or production service.
The Speedle MCP section is a launch preview: `@speedle/mcp` is not published
on npm, and its install and client configuration snippets are marked as
available at launch. MCP facts come from teramoby/speedle-mcp issues #1 and #2.
Speedle AI uses white backgrounds with light-purple accents; the header,
Products navigation, sphere favicons and footer follow the shared three-site
format of speedle.io.

## SEO and GEO

`sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt` at the root are
hand-maintained; there is no generator. The sitemap and both home pages declare
`hreflang` alternates for `en`, `zh-CN` and `x-default`. The complete Chinese
page is at `/zh/`. Every factual claim in these files must already be
true on the page: `@speedle/mcp` is not on npm, Speedle Cloud is coming soon,
and AI risk detection is not shipped.

`node scripts/check-seo.mjs` verifies that the sitemap and `llms` link targets
resolve to files and anchors in this repository, that each sitemap entry's
`hreflang` entries match its page, that both pages' JSON-LD blocks parse and
cover Organization, WebSite and SoftwareApplication, and that neither home
page has a visible FAQ section or FAQPage data. It also checks the
language-switch links, Chinese metadata and diagram labels,
Cloudflare Web Analytics on both pages, and byte-identical SPDL blocks
including comments. No dependencies.

Every public page loads the cookieless Cloudflare Web Analytics beacon before
`</body>`; the site has no signed-in pages or API responses.

## Preview

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this directory.
Open http://127.0.0.1:8765. There are no dependencies or build steps.

## Publish

GitHub Pages publishes the root of main. Commit and push static files to update.
CNAME binds ai.speedle.io; .nojekyll disables Jekyll.

DNS: DNS-only CNAME ai → teramoby.github.io.
GitHub Pages handles the custom-domain certificate and HTTPS enforcement.
Main site: https://speedle.io, managed in teramoby/speedle-plus separately.

## Brand provenance

Original bird artwork, without raster modification, from teramoby/speedle-plus:

- docs/images/Speedle+ Horizontal-01.png → assets/speedle-plus.png
- docs/img/speedle/Speedle_logo_home_bold.svg → assets/speedle-logo-header.svg
- docs/img/speedle/Speedle_logo_about.svg → assets/speedle-mark.svg
- docs/img/speedle/Speedle_logo_w.svg → assets/speedle-logo-footer.svg
- docs/img/speedle/Speedle_logo_home_bold.svg → assets/speedle-mark-ai.svg,
  colours changed only (wordmark #fff → #182034, sphere #ff9a45 → #8b5cf6)

favicon.svg uses the sphere paths from assets/speedle-mark-ai.svg without path
edits, coloured #8b5cf6 on a transparent background, with the shared v13
favicon treatment: no dark outline, and the sphere's own strokes scaled up
(outer polygon ×2.0, inner lines ×2.2) so the mark stays legible at 16 px. The
viewBox is the shared 115-unit sphere box used by the Engine and Cloud
favicons. favicon.ico contains PNG renders of that SVG at 16, 32 and 48 px;
apple-touch-icon.png is 180×180 with the sphere on white and 20 px visible
padding. The Products menu uses the same sphere paths in Engine orange
(#ff9a45), Cloud blue (#4da3ff) and AI purple (#8b5cf6).

assets/og-image.png is the 1200×630 share image: the Speedle | AI lock-up and
page headline on the site's white and light-purple background. Its text repeats
page copy; it adds no claims.

The four assets/social-*.svg files are the speedle.io footer icons recoloured
from white to AI ink (#182034), without path edits. The Google Groups icon is
from Google Material Icons; its notice and Apache 2.0 license are included in
assets/Google-Groups-NOTICE.txt and assets/Material-Icons-LICENSE.txt.

Speedle continues Oracle Speedle and is maintained by the original developers.
Speedle is licensed under UPL 1.0. Contact: contact@speedle.io.

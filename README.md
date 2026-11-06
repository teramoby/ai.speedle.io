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
file store (`eval.NewFromFile`) before it is published; keep the page text
byte-identical to what was tested.

The interactive example uses simplified
browser-local policy rules and does not simulate AI risk detection. It is
not a Speedle engine, MCP integration, RAG adapter, or production service.
The Speedle MCP section is a launch preview: `@speedle/mcp` is not published
on npm, and its install and client configuration snippets are marked as
available at launch. MCP facts come from teramoby/speedle-mcp issues #1 and #2.
Speedle AI uses white backgrounds with light-purple accents; the header,
Products navigation, sphere favicons and footer follow the shared three-site
format of speedle.io.

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
edits on a transparent background. favicon.ico contains PNG renders at 16, 32
and 48 px; apple-touch-icon.png is 180×180 with the sphere on white and 20 px
visible padding. The Products menu uses the same sphere paths in Engine orange
(#ff9a45), Cloud blue (#4da3ff) and AI purple (#8b5cf6).

The four assets/social-*.svg files are the speedle.io footer icons recoloured
from white to AI ink (#182034), without path edits. The Google Groups icon is
from Google Material Icons; its notice and Apache 2.0 license are included in
assets/Google-Groups-NOTICE.txt and assets/Material-Icons-LICENSE.txt.

Speedle continues Oracle Speedle and is maintained by the original developers.
Speedle is licensed under UPL 1.0. Contact: contact@speedle.io.

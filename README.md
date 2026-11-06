# Speedle for AI

Standalone public exploration website: https://ai.speedle.io

Potential applications: agent tool calls, knowledge access, and multi-agent
authorization. The interactive example uses simplified browser-local rules.
It is not a Speedle engine, MCP integration, RAG adapter, or production service.
The visual language and colour tokens follow speedle.io and cloud.speedle.io.
Like those references, the site uses a light theme with dark-purple brand bands.

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
- docs/images/sp_small.png → assets/speedle-bird.png
- docs/img/speedle/Speedle_logo_home_bold.svg → assets/speedle-logo-header.svg
- docs/img/speedle/Speedle_logo_about.svg → assets/speedle-mark.svg
- docs/img/speedle/Speedle_logo_w.svg → assets/speedle-logo-footer.svg

assets/favicon.svg embeds assets/speedle-bird.png unmodified on a dark tile,
so the white bird stays visible on light browser tabs.

Speedle+ continues Oracle Speedle and is maintained by the original developers.
Speedle+ is licensed under UPL 1.0. Contact: contact@speedle.io.

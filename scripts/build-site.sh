#!/usr/bin/env bash
# Assembles exactly the files published to https://ai.speedle.io.
#
# The Pages deployment (.github/workflows/pages.yml) uploads only this output,
# so repository files such as README.md, LICENSE, SECURITY.md, CONTRIBUTING.md,
# DCO, skills/, samples/ and scripts/ are never served as site pages. They stay
# in the repository and on GitHub.
#
# Usage: scripts/build-site.sh [output-directory]
# Prints the published paths, one per line, relative to the site root.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-_site}"
case "$out" in
  /*) ;;
  *) out="$root/$out" ;;
esac

rm -rf "$out"
mkdir -p "$out"

site_files=(
  404.html
  CNAME
  app.js
  apple-touch-icon.png
  favicon.ico
  favicon.svg
  index.html
  llms-full.txt
  llms.txt
  patterns/index.html
  robots.txt
  sitemap.xml
  styles.css
  zh/index.html
  zh/patterns/index.html
)

for file in "${site_files[@]}"; do
  mkdir -p "$out/$(dirname "$file")"
  cp "$root/$file" "$out/$file"
done

mkdir -p "$out/assets"
cp "$root"/assets/* "$out/assets/"

# Fail before deploying if a repository-only path reaches the site output.
for forbidden in README.md LICENSE SECURITY.md CONTRIBUTING.md DCO skills samples scripts .github .gitignore .nojekyll _config.yml; do
  if [ -e "$out/$forbidden" ]; then
    echo "refusing to publish repository path: $forbidden" >&2
    exit 1
  fi
done

cd "$out"
find . -type f | sed 's|^\./||' | LC_ALL=C sort

# Contributing to Speedle for AI

We welcome your contributions! There are multiple ways to contribute.

## Issues

If you hit a bug or have an enhancement request then file a
[GitHub issue](https://github.com/teramoby/ai.speedle.io/issues).

If you report a bug, please include:

1. The page URL and the commit you are looking at
2. Issue description
3. Browser and environment, when the problem is visual
4. Reproducible steps
5. Expected behavior

## Security

Do not report a security issue in a public issue. See [SECURITY.md](SECURITY.md)
for the private reporting channels.

## Code

We welcome code contributions.

Contributions to Speedle are made under the Universal Permissive License 1.0
(UPL-1.0). Please sign off your commits to certify that you have the right to
submit your contribution under the Developer Certificate of Origin (DCO) 1.1.
Retain existing copyright and license notices and identify any third-party
material in your pull request.

Sign off each commit with `git commit -s` (see [DCO](DCO) and
[UPL-1.0 LICENSE](LICENSE)), which adds a
`Signed-off-by: Your Name <you@example.com>` trailer using your Git `user.name`
and `user.email`. To add a sign-off to existing commits, run
`git commit --amend -s` for the most recent commit or
`git rebase --signoff origin/main` for a branch of commits.

The process:

1. Sign off each commit with `git commit -s` (see [DCO](DCO) and
   [UPL-1.0 LICENSE](LICENSE))
2. Fork the repo
3. Fix an issue or create an issue and fix it
4. Create a Pull Request that fixes the issue
5. Watch your PR for pipeline results. If there are failures then fix them.
6. We will review your PR and merge as appropriate.

Read [README.md](README.md) before changing a page. It records the
hand-maintained SEO/GEO files, the rule that every SPDL example stays
byte-identical to what was tested with the Speedle file store, and the
provenance of the artwork.

The site has no build step and no dependencies. Preview it with:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Before opening a PR, run the repository check:

```sh
node scripts/check-seo.mjs
```

## Code of Conduct

Follow the [Golden Rule](https://en.wikipedia.org/wiki/Golden_Rule). If you'd
like more specific guidelines see the
[Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/1/4/code-of-conduct.html).

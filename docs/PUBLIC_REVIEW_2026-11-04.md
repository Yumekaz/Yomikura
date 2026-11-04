# Public repository and website review — November 4, 2026

Scope: the default branch, public homepage and browser guide, download metadata, public policies, issue templates, dependency graph, CodeQL and full-history secret scanning. This review is not a legal opinion, penetration-test certificate or guarantee that software has no vulnerabilities.

## Findings and corrections

| Before | After | Why |
| --- | --- | --- |
| PR dependency review could not run because the dependency graph was unavailable | Dependency graph/alerts and security update pull requests enabled; the PR dependency review runs normally | Restores the missing review gate rather than skipping it |
| No working private security-report path | Private vulnerability reporting enabled, with direct links in SECURITY.md and issue templates | Researchers can report privately without publishing library data or exploit details |
| DMCA instructions suggested a public issue while requesting signatures and contact details | Informal public corrections contain only public information; formal notices go through GitHub's official process | Avoids requesting sensitive legal information in public issues; does not claim a registered agent or statutory status |
| Privacy omitted website hosting and update requests | Describes GitHub Pages, shared browser origin/storage, demo state, update traffic, and the guide's direct-address navigation | Matches the public website and reader's actual network boundary |
| README/terms claimed the project shipped no media at all | Distinguishes original generated demo artwork from third-party comic catalogues | Preserves accurate attribution and content boundaries |
| Platform instructions advertised Intel macOS downloads | Identifies published Apple-silicon macOS and x86_64 Linux packages and their testing limits | Matches actual release assets |
| Preview HTTP requests used a filesystem stat/read pair | Serves an immutable in-memory public snapshot, excludes hidden files/symlinks, and accepts GET/HEAD only | Removes request-time filesystem races; tests cover traversal, symlinks and snapshot isolation |
| A test used a URL string-prefix comparison | Compares the parsed origin exactly | Avoids an ambiguous security assertion |
| Full-history Gitleaks matched two public checksum cache keys | Two exact verified historical fingerprints recorded in .gitleaksignore | All other secret matches remain failures |
| Dependency advisories were invisible until alerts were enabled | Reviewed lockfile updates, full npm development/production audit, native compilation/tests and dependency review | Checks build tools as well as runtime packages |
| Website offered privacy/license links only | Homepage and browser guide also link Security, Copyright and Terms; static pages restrict script/network origins with CSP and use no-referrer | Makes policies reachable and narrows the marketing page's browser permissions |

Local Markdown file targets were checked across tracked documentation; no missing file targets were found. Neither private Mihon reference folder, local caches nor credential files were tracked. Both reference folders are ignored explicitly. Original generated hero artwork and font notices remain attributed; private reference screenshots are not public assets.

## Dependency and release boundaries

The repair updates the native ZIP library and updater dependency, TLS/transport dependencies, and affected JavaScript build/test packages. The newer ZIP API validates names with a fallible result; production handling propagates errors and the existing archive round-trip tests retain their assertions.

Existing installers, including beta.5, are immutable reviewed artifacts from an earlier source commit. Updating main does **not** patch those downloaded binaries. A separate security release still requires an installer build, package-integrity checks and installed-app verification. The source patch does not silently republish an older tag or change the stable updater channel.

The Linux GTK stack still carries the upstream glib VariantStrIter advisory, GHSA-wrw7-89jp-8q8g. Its patched major version needs upstream-compatible integration. The alert is retained; native Linux testing and this dependency constraint remain open. An advisory is not proof of an exploitable path in Yomikura, and the absence of a known path is not proof of safety.

## Verification and limits

The main-branch scan closed the repaired high-severity preview-server and test-URL findings, plus the upstream-watch report warning. Five medium CodeQL findings remain open in CLI build/test helpers. Alerts 19/20 concern writing validated public GitHub metadata to a fixed JSON cache and numeric-version/hex-commit values to GITHUB_OUTPUT; alert 16 concerns using tracked numeric Suwayomi versions in official release-download URLs; alerts 17/18 concern GET requests for public generated archive/checksum paths to the test's own loopback preview. These flows were reviewed as intended build/test I/O, with no personal library files or secrets sent. The warnings remain available for maintainer review; this analysis does not silently dismiss them or disable either query.

Installer verification additionally requires matching the native and JavaScript Tauri core/updater major/minor versions. The patched native updater uses the corresponding JavaScript updater package; native compilation alone does not establish that the installer bundle is valid.

The review is delivered through [PR #13](https://github.com/Yumekaz/Yomikura/pull/13); its checks show the exact source revision and final results. Security runs include CodeQL, dependency review, full-history Gitleaks and the full npm audit at high severity. Verify runs include typechecking, unit/browser tests, bundle checks, native compilation, Rust formatting, native tests and Clippy. Pages runs check the published path layout, both appearances, mobile width, accessibility, demo reading and the ordinary web ZIP on real isolated Suwayomi 2.3.2243 and 2.4.2366.

The public guide's version coverage is limited to the tested connection/Local-source/library/read/progress/deep-link journey. It does not certify every extension, tracker, OS bundle launcher or platform. GitHub Pages does not support every configurable HTTP security header; the page's CSP meta tag is not a claim that every response header is enforced. Publisher signing, interactive macOS/Linux use, spoken screen-reader output and third-party service reliability retain their documented limits.

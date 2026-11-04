# Security policy

## Report a vulnerability privately

Use [Report a vulnerability](https://github.com/Yumekaz/Yomikura/security/advisories/new) on this repository. Private vulnerability reporting is enabled. Please do not put exploit details, credentials or private library data in public issues.

Include the affected release or commit, operating system, whether you used the desktop app, self-hosted web app or public demo, a minimal reproduction using synthetic data, and the expected impact. Redact access tokens, cookies, passwords, private server addresses and personal files. Do not submit a real user's library as a proof of concept.

This is a volunteer project. Reports are reviewed by the maintainer; there is no guaranteed response deadline or paid support agreement. Please coordinate disclosure while a report is investigated.

## Versions and updates

The current development branch and newest public beta are the primary investigation targets. Older stable releases may not receive backports. A green CI run is not a guarantee that a release has no vulnerabilities; dependency advisories, platform coverage and release-specific limitations must also be checked. See [known issues](docs/KNOWN_ISSUES.md) and [public releases](https://github.com/Yumekaz/Yomikura/releases).

CodeQL checks JavaScript and TypeScript, Gitleaks checks committed secrets, dependency review checks pull requests, and Dependabot monitors supported manifests. Rust/native behavior also requires review and platform tests. These checks do not audit third-party extensions or certify every backend/provider.

## Boundaries

Yomikura's UI/native shell, optional local backend lifecycle, public website and client/server boundary are in scope. Suwayomi, extension stores, source websites, Java and other upstream dependencies have their own maintainers; an upstream problem can still affect Yomikura.

Use HTTPS for remote libraries and keep a local engine bound to loopback unless you deliberately configure secured network access. Extensions run on Suwayomi with its permissions; install only sources you trust. App lock and capture protection do not encrypt stored library files.

Download from the [official homepage](https://yumekaz.github.io/Yomikura/) or repository releases, verify published checksums, and read signing/platform limitations before installing. Never post a suspected leaked secret publicly; revoke it at its provider and use the private reporting route.

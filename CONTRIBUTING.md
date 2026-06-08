# Contributing Guidelines

Thank you for your interest in contributing to **Yomikura**! We welcome community contributions that improve our self-hosted web client's performance, layout configurations, and reader experience.

## Contribution Policy & Legal Compliance

To protect the project and its maintainers, we enforce strict legal boundaries. **All contributions must comply with these guidelines:**

1. **No Content Sourcing or Scraping Logic:** Yomikura is purely a static frontend shell. We do not accept contributions containing site-specific scraping code, URL bypasses, or proxy server hosting scripts.
2. **No Bundled Extensions:** We do not host or distribute manga/comic extensions or community repositories. All extensions and index logic belong strictly to the backend (Suwayomi or similar).
3. **No Copyrighted Material:** Do not submit pull requests containing copyrighted manga panels, characters, cover art, or real-world publisher trademarks in screenshots, mock assets, or code. Use synthetic placeholders or public-domain assets for demo interfaces.
4. **License Compliance:** By contributing to Yomikura, you agree to license your contributions under the project's [MIT License](LICENSE).

## Submission Guidelines

- **Code Quality:** All code must pass TypeScript typechecks (`pnpm typecheck` / `tsc -b`) and Vite production compilation (`pnpm build`).
- **Clean Git Commit History:** Avoid pushing unnecessary files or log scripts. Stage only relevant changes in the `/src` or `/docs` directories.

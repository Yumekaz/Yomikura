# Contributing Guidelines

Thank you for your interest in contributing to **Yomikura**! We welcome contributions that improve the **web, PWA, and desktop** client — performance, layout, reader UX, and Tauri integration.

## Contribution Policy & Legal Compliance

To protect the project and its maintainers, we enforce strict legal boundaries. **All contributions must comply with these guidelines:**

1. **No Content Sourcing or Scraping Logic:** Yomikura is a client shell only. No site-specific scraping, bypasses, or proxy hosting in this repo.
2. **No Bundled Extensions or Repos:** Do not commit extension APKs, repo indexes, or default pirate source URLs. Extensions belong on the user's Suwayomi instance.
3. **Desktop backend boundary:** Tauri may *download* official Suwayomi Server releases at runtime; do not embed proprietary extensions or copyrighted catalogs in the repo.
4. **No Copyrighted Material:** Do not submit pull requests containing copyrighted manga panels, characters, cover art, or real-world publisher trademarks in screenshots, mock assets, or code. Use synthetic placeholders or public-domain assets for demo interfaces.
5. **License Compliance:** By contributing to Yomikura, you agree to license your contributions under the project's [MIT License](LICENSE).

## Submission Guidelines

- **Code Quality:** All code must pass TypeScript typechecks (`pnpm typecheck` / `tsc -b`) and Vite production compilation (`pnpm build`).
- **Clean Git Commit History:** Avoid pushing unnecessary files or log scripts. Stage only relevant changes in the `/src` or `/docs` directories.

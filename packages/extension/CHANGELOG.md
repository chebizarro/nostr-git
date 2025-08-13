# Changelog

All notable changes to the `nostr-github-extension` package will be documented in this file.

## 0.2.0 - 2025-08-12

- Confirmation dialogs added before publishing repo announcements and permalinks (including context menu flows). Cancel actions show a gentle cancel snackbar.
- Snackbars: clickable full URL+nevent links (do not dismiss on click), persistent until manually closed, auto-dismiss after 5s (success/error) or 3s (cancel), with fade/slide animation and `prefers-reduced-motion` support.
- Viewer base URL setting in popup with normalization (ensures scheme and trailing slash). Defaults to `https://njump.me/`.
- Popup restyled with modern card UI and dark mode; improved inputs and buttons; a11y preserved.
- Compile-time debug toggle: release builds can hide the "Debug: console-only" option via `NOSTR_GIT_SHOW_DEBUG=false`.
- Internal: added tests for snackbar behavior, viewer base normalization, and clipboard fallback for nevent copy.

## 0.1.1 - 2025-08-12

- Popup polish: form submit handling, reset to defaults, validation/deduplication/normalization of relay URLs.
- A11y: labeled fields, `role="status"` live region, keyboard submit, focus restoration after actions.
- Build: production mode (`--prod`) in `esbuild.config.js` with minification and NODE_ENV=production.
- Scripts: `build:chrome:prod`, `build:firefox:prod`, `zip:chrome`, `zip:firefox`, `release:zip`.
- Event creation: use `@nostr-git/shared-types` for NIP-34 root events; keep NIP-22 comments minimal.

## 0.1.0 - 2025-08-01

- Initial refactor: debounced DOM observer, robust selectors, idempotent injection.
- A11y: aria-labels/titles on injected buttons, keyboard handling for menu items.
- Minimal permissions (storage), clipboard operations gated by user gesture.

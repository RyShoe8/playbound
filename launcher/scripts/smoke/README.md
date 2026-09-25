# Launcher smoke test

Run `npm run test:smoke` from `launcher/` after `npm ci`. It uses the installed Electron binary; no separate browser download is needed. Headless Linux requires `xvfb-run` and Electron's system libraries.

The test loads the real `bootstrap.js`, `main.js`, renderer modules and preload/IPC bridge. It opens Home, Friends and a game detail page, clicks Install and Uninstall, and checks both the rendered state and a temporary installation marker. Renderer exceptions, preload failures, main-process failures and crashes fail the test.

Only catalog/account responses and mock installation work are substituted at registered IPC handlers. No real game download, extraction, executable launch, authentication or multiplayer connection is tested. Those still need their existing unit/integration tests and game-specific validation.

Each run creates its own temporary Electron profile and games directory. Background fetches return offline fixtures, renderer HTTP requests are blocked, and protocol registration, login startup settings and global shortcut registration are disabled. No production token or database is used. The test entry is outside the packaging allowlist.

`test-results/` contains a screenshot, trace and logs; inspect traces with `npx playwright show-trace <path-to-trace.zip>`. Repository checks upload these on failure. Windows build orchestration and macOS/Linux build preparation run this test before packaging, and fail the build if it fails.

Party state lives in `renderer/partyStore.js`. Reads carry a token from the start of the request (including prefetches); only the store accepts responses. Local actions invalidate older reads, preserve unknown/temporarily empty responses and settle optimistic updates without rolling back later changes. `renderer/partyStore.test.mjs` covers response ordering, rollback, leave, account changes and install-return behavior.

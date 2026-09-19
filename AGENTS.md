# Repository Guidelines

## Project Structure & Architecture

TeslaDrome is a React single-page application built with Vite for Navidrome and compatible OpenSubsonic servers. `src/main.jsx` contains the application state, API client, playback engine, views, and React components. `src/styles.css` contains the Tesla-oriented layout, responsive sizing, theme, and component rules. Keep the two files aligned when changing a user interaction.

`main.jsx` is intentionally a single module. Its playback queue, local history, view stack, scrolling behaviour, and three-player audio handoff share state; make focused changes and avoid unrelated refactors. Preserve the distinction between ordered album/playlist playback and the persistent local history queue.

`index.html` is the Vite entry document and `vite.config.js` sets the `/tesla/` deployment base. `dist/` is generated output and must not be edited manually.

`nginx.conf`, `start_it`, and `start_daemon` provide the local Nginx Docker preview. It serves `dist/` under `/tesla/` and proxies the same-origin `/auth/` and `/rest/` endpoints to Navidrome. `scripts/deploy.sh` is the production deployment path.

## Build, Test, and Development Commands

- `npm ci` installs the locked dependencies for a clean local setup.
- `npm run dev` starts Vite on `127.0.0.1`.
- `npm run build` produces the deployable bundle in `dist/`.
- `./build_it` runs the local production build. It requires dependencies to be installed already.
- `./start_it` serves `dist/` through local Nginx on port 8095; build first, then open `http://localhost:8095/tesla/`.
- `./start_daemon` starts that preview in the background.

There is no automated test suite. Before submitting changes, run `./build_it` and manually check the affected flows. For changes with broader UI or state impact, also check login, search, album and artist navigation, playback controls, queue/history navigation, playlists, and compact-height behaviour. Test in the Tesla browser when available.

## Coding Style & Naming Conventions

Follow the existing style: two-space indentation, no semicolons, double-quoted strings, and concise comments only where behaviour is non-obvious. Use `camelCase` for functions, variables, and React state setters; use `PascalCase` for React components. Keep UI strings consistent with the active application language and use the existing Lucide icon set rather than adding custom SVG markup.

Keep touch controls large and predictable. For scrollable collection views, preserve clear visual feedback and ensure behaviour works in compact-height viewports as well as the normal Tesla browser layout.

## Navidrome Integration and State

Use `subsonic()` and `subsonicUrl()` for OpenSubsonic requests so authentication and the same-origin proxy behaviour remain consistent. Keep API requests scoped to the existing Navidrome/OpenSubsonic contract; document any new endpoint in the README.

Authentication, saved user profiles, playback state, theme, and skip statistics are browser-local. Preserve user isolation and do not affect Navidrome's standard web-client login state when changing authentication or local-storage code.

## Commit & Pull Request Guidelines

Use short, imperative, capitalized commit subjects, following existing history: `Fix add user login flow`, `Adjust media session handlers`, or `Add playlist search issue`. Keep one logical change per commit.

Pull requests should state the user-visible behaviour changed, identify any Navidrome API impact, link a tracked issue when relevant, and include screenshots for layout changes. Mention manual Tesla-vehicle testing separately from desktop-browser testing.

## Security & Configuration

Do not commit Navidrome credentials, tokens, private server details, or editor swap files. Treat API URLs and logs as sensitive because OpenSubsonic authentication values may be included in query parameters. Keep authentication browser-local and verify changes preserve the separate Tesla-specific storage.

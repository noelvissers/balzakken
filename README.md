# Card Game Scorekeeper

A local-first scorekeeper for physical multiplayer card games. Game logic is pure TypeScript; the active game is saved in browser `localStorage`. No account, backend, or runtime API is used.

## Run Locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173/`.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Vitest covers game scoring, threshold behavior, dealer selection, elimination, undo, persistence validation, browser workflows, and storage failures.

## Offline and Saved Games

After the first successful online load, the service worker caches the application shell and static assets for offline launches. Scoring and saving work without a network connection. The game itself is stored separately under the `card-game-active` localStorage key; only the current game and its undo history are retained.

Clearing browser site data, using a private browsing session, or removing the site’s storage may permanently delete the active game. A storage warning is shown if the browser refuses to save or load game data.

## GitHub Pages

The GitHub Actions workflow runs tests, type checking, and a production build, then deploys `dist/` to Pages. It derives the Vite base path from `GITHUB_REPOSITORY`, including project sites such as `https://username.github.io/repository-name/`. Set `VITE_BASE_PATH` only when a custom path is needed.

To enable deployment, open the repository’s **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. Push to `main` or `master`, or start the workflow manually from the Actions tab. No secrets are required.

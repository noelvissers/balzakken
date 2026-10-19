# Card Game Scorekeeper

A local-first scorekeeper for physical multiplayer card games. Game logic is pure TypeScript; the active game is saved in browser `localStorage`. No account, backend, or runtime API is used.

## Run Locally

Requires Node.js 20.19+ and npm.

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

## Scoring Notes

- A caller above 5 receives a special +25 penalty; all other players receive zero.
- If a caller at 5 or below ties or loses to another hand, the caller gets +25 and the other players score their hand values normally.
- Otherwise every player scores their hand value normally.
- Normal scores are clamped to zero, then reduced by 25 only when the resulting score is exactly 50, 75, or 100. Crossing a threshold does not trigger a deduction. The special +25 penalty never triggers a threshold deduction.
- Players at 100 or more are eliminated and stay on the scoreboard. If one player remains, they win. If a round eliminates everyone at once, the game ends with no winner; this avoids leaving an unplayable game active.
- The next dealer is chosen uniformly from the highest-hand players who remain active. The selected dealer is persisted and is not rerolled on refresh.

## Offline and Saved Games

After the first successful online load, the service worker caches the application shell and static assets for offline launches. Scoring and saving work without a network connection. The game itself is stored separately under the `card-game-active` localStorage key; only the current game and its undo history are retained.

Clearing browser site data, using a private browsing session, or removing the site’s storage may permanently delete the active game. A storage warning is shown if the browser refuses to save or load game data.

## GitHub Pages

The GitHub Actions workflow runs tests, type checking, and a production build, then deploys `dist/` to Pages. It derives the Vite base path from `GITHUB_REPOSITORY`, including project sites such as `https://username.github.io/repository-name/`. Set `VITE_BASE_PATH` only when a custom path is needed.

To enable deployment, open the repository’s **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. Push to `main` or `master`, or start the workflow manually from the Actions tab. No secrets are required.

## TODO

1. Use font https://www.1001fonts.com/mochibop-font.html for all text
1. Use non transparent shadows for buttons/cards
1. Figure out a good color scheme
1. Change background and icons
1. Change text and titles (to Dutch)
1. Show name under input box so its clear who's who when typing in score

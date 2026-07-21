# DAY ONE

DAY ONE is a quiet daily-discipline PWA for the OpenAI Build Week “Apps for your life” track. Its promise is simple: show up anyway.

## Run it

You can open `index.html` directly, or serve this folder over localhost so the service worker can register:

```bash
python -m http.server 4173
```

Open `http://localhost:4173` on a phone or browser. The app stores state locally under `dayone.v1` and works without an account.

## GPT-5.6 check-in

The app calls `/api/check-in` by default. Use a same-origin proxy for that route, or set `window.DAY_ONE_API_ENDPOINT` before `app.js` to the deployed Worker URL. The Worker returns `source: "gpt-5.6"` only after a successful OpenAI response; the UI then labels the check-in `GPT-5.6`. Network and configuration failures stay visibly `OFFLINE` and use the local fallback question bank.

From the Worker directory, deploy the online check-in service:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

`worker/wrangler.toml` already sets `OPENAI_MODEL = "gpt-5.6"`. After deploy, copy the printed `https://…workers.dev` URL into the app host before `app.js`:

```html
<script>window.DAY_ONE_API_ENDPOINT = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev';</script>
```

For a restricted production origin, add `ALLOWED_ORIGIN` as a Worker variable in the Cloudflare dashboard or use the same secure secret command. Never put `OPENAI_API_KEY` in the app, HTML, or a checked-in `.env` file. `GET /api/check-in` is a health check and `OPTIONS` supports browser preflight.

## How I built this with Codex + GPT-5.6

Codex accelerated the shell, state model, PWA files, responsive interface, local export, proof-photo shrinking, and the Worker boundary in one build session. The product deliberately keeps GPT-5.6 narrow: it generates one context-aware question at the moment a block ends. It is not a chat screen and it does not replace the user’s judgment. A deterministic local fallback keeps the core loop reliable offline.

## Product decisions

- 70% of blocks counts as a day, with a humane streak model.
- Late starts do not create an automatic loss.
- Proof photos are optional, resized in the browser, and stored locally.
- No accounts, analytics, or paid dependencies.

MIT License.

## Feature tour

- **Onboarding and plan generation:** three simple choices create a fixed, personal day. An optional Goal Pot gives each completed block a small, honest amount toward something real.
- **Today and Live Block:** Today shows the one live or next block. Opening it enters a quiet focus screen with a timer, a first move, checkable block tasks, and a breakfast card when relevant.
- **Check-in and journal:** after a block, GPT-5.6 generates one contextual reflection question when the Worker is available. The offline question bank keeps the loop usable without a network. Entries can include a mood, note, blockers, and optional proof.
- **Calm Layer:** a private place to set an intention, choose available energy, protect fixed time, rebalance flexible blocks, start a ten-minute rescue, or close the day gently.
- **Tasks, schedule, streaks, and stats:** tasks can be assigned to blocks, the schedule can be adjusted, streaks celebrate returns rather than perfection, and weekly stats describe patterns in plain language.
- **Journal book and Goal Pot:** the journal turns daily proof into an editorial record. The Goal Pot is a local, derived ledger only; it never claims to hold money and requires the user to make any real transfer themselves.

## Demo and reset

For a submission walkthrough, finish onboarding and open **Settings**:

- **Load demo** seeds fourteen days of journal entries, day history, grouped tasks, and a protected hold so the Journal, Tasks, Stats, Streak, and Calm screens immediately have a story to show.
- **Reset app** is a deliberate two-tap action that erases local app data and returns permanently to the first onboarding screen.
- The evaluator shortcut [/?start](http://localhost:4181/?start) opens onboarding for a temporary fresh walkthrough without deleting saved data.

Settings includes a backend health check. It reads `window.DAY_ONE_API_ENDPOINT` when provided, otherwise it checks `/api/check-in`; a static file server will correctly report that endpoint as unavailable until the Worker is deployed or proxied.

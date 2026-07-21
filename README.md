# DAY ONE

Hi, I’m Santhosh. I built DAY ONE because I procrastinate. Badly.

It’s not that I don’t want to do the work. I sit there and think, “I’ll start at eleven.” Then it’s eleven fifteen, so I decide I’ll start at twelve. The whole day goes like that. Nothing gets done, and I still feel tired at the end of it.

Every productivity app I tried gave me a longer list. A longer list is the opposite of what I need.

DAY ONE gives me a day I can follow without planning it again and again. I choose when I wake up and what matters. The app turns that into blocks. I only have to deal with the next one.

When a block ends, I answer one question. That record becomes part of a private journal, so I can see what I actually did instead of guessing how the day went.

## Try it

Live demo: [day-one-pwa.pages.dev](https://day-one-pwa.pages.dev). The current deployment is also available at [8f095269.day-one-pwa.pages.dev](https://8f095269.day-one-pwa.pages.dev). The app installs as a PWA when opened from a supported browser and added to a phone home screen.

## Run it locally

From the project root:

```bash
python -m http.server 4173
```

Open http://localhost:4173. Opening `index.html` directly also renders the app, but a service worker cannot register from `file://`.

The app stores its state locally under `dayone.v1`. It does not require an account.

## Sample data

On a fresh install, open Settings and tap **Load demo**. This seeds fourteen days of history, journal entries, proof snapshots, grouped tasks, a protected hold, and Goal Pot block effort. It gives Journal, Stats, Streak, Calm, Today, and the goal surfaces something to show.

To erase local data and return to onboarding, use Settings > **Reset app**, then confirm. For a temporary onboarding walkthrough without deleting saved data, open `/?start`.

## What the app does

- Onboarding creates a fixed day from wake time, focus, and food preferences.
- Today shows progress, streak, the next block, and the optional Goal Pot.
- Live Block keeps one timer, one first move, and the block's tasks in view.
- A block check-in asks one question, then logs the answer, note, mood, blocker, and optional proof photo.
- The Journal is a Monday-first month calendar. A selected day opens its timeline, missed blocks, notes, and proof photos.
- GPT-5.6 writes a short record of a day from the information I entered. The result is cached by date. Offline days use a local summary.
- Calm, Tasks, Schedule, Stats, Streak, Settings, notifications, export, and calendar export are included.

## GPT-5.6 check-in and day writing

The browser sends POST requests to `window.DAY_ONE_API_ENDPOINT`, which defaults to `/api/check-in`. The deployed Worker can handle both the original check-in request and the journal day-writing request with `mode: "day"`.

The check-in is one question at one moment. It is not a chat screen. Day writing receives block names, timestamps, answers, and notes capped at 300 characters per note. Photos are never sent to the Worker. The Worker asks GPT-5.6 for a short past-tense record and returns `source: "gpt-5.6"`. The client caches the result by date and never requests the same date twice during a session. If the network or key is unavailable, it stores a local summary and labels it `COMPOSED ON THIS DEVICE · OFFLINE`.

`worker/wrangler.toml` pins:

```toml
OPENAI_MODEL = "gpt-5.6"
```

Deploy the Worker:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

After deployment, set the Worker URL before `app.js` in `index.html`:

```html
<script>window.DAY_ONE_API_ENDPOINT = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev';</script>
```

Never put `OPENAI_API_KEY` in the repository, HTML, or a `.env` file. `GET /` is a health check. `OPTIONS` supports browser preflight. `/api/*` is not cached by the service worker.

## How Codex and GPT-5.6 were used

Codex produced the local state model, screen registry, render lifecycle, responsive layouts, service worker and offline cache, in-browser proof-photo resizing, Worker boundary, Goal Pot ledger, month calendar, and day-story view.

GPT-5.6 was used for the block timing model, product decisions about what DAY ONE refuses to do, check-in prompt design, and the optional journal day-writing response. The app does not present GPT-5.6 as a general chat assistant.

## Product decisions

- Seventy percent of blocks counts as a day.
- A late start is not an automatic loss.
- Streaks are humane and allow recovery.
- Proof photos are optional, resized in the browser, and stored locally.
- There are no accounts, analytics, or paid dependencies.
- The Goal Pot is a local derived ledger. It does not hold money or make transfers.

## Privacy

Proof photos stay on the device and are never sent to the Worker. If GPT-5.6 day writing is enabled, the app sends the selected day’s block names, timestamps, answers, and short notes to the Worker for that one response. The Worker does not receive photos. All other app state remains in local storage unless the user explicitly exports it.

## License

MIT. See [LICENSE](LICENSE).

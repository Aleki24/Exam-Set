---
name: run-exam-set
description: Build, run, screenshot and drive the Skulbase Exams Next.js app (Exam-Set). Use when asked to run, start, launch, serve, screenshot, smoke-test, or interact with the site, to check that a UI change renders, or to reproduce a page bug in a real browser.
---

# Running Skulbase Exams

Next.js 15.5.9 App Router shop for Kenyan CBE/8-4-4 exam papers, on Supabase.
Driven headlessly by `.claude/skills/run-exam-set/driver.mjs` — a Playwright
harness that boots the server itself, drives real Chromium, and writes
screenshots you can open.

All paths below are relative to the repo root (`/home/user/Exam-Set`).

## Prerequisites

Chromium and Playwright are already installed in this container. Nothing to
`apt-get`. Two things matter:

```bash
node -v                      # v22.22.2
ls /opt/pw-browsers          # chromium-1194, chromium_headless_shell-1194
```

Playwright is a **global** module (`/opt/node22/lib/node_modules/playwright`),
not a project dependency. `driver.mjs` resolves it explicitly via
`createRequire`; a bare `import 'playwright'` from inside this project fails.

## Setup

```bash
npm ci
```

Then create `.env.local` (gitignored). **The app boots and serves HTTP 200 on
every public route with no env file at all**, but `/plans`, `/cart` and the
catalogue's API throw "Supabase is not configured" without these two:

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_BASE_URL=http://localhost:3000
EOF
```

Get both from Supabase → Project Settings → API, or via the Supabase MCP
connector (`get_project_url`, `get_publishable_keys`). The anon key is
browser-safe and RLS-gated; never put `SUPABASE_SERVICE_ROLE_KEY` in a file you
might commit.

## Build

Required — the driver serves the production build, not `next dev`:

```bash
npm run build
```

Takes ~90s. Ends with a deployment-tracing check that must print
`All deployment-tracing checks passed.`

## Run — agent path

```bash
# screenshot the default public routes (~30s, boots and stops its own server)
node .claude/skills/run-exam-set/driver.mjs shots

# specific routes
node .claude/skills/run-exam-set/driver.mjs shots /catalog /set

# drive a real user journey: load catalogue, assert hydration, type in search,
# open the setter (~20s)
node .claude/skills/run-exam-set/driver.mjs flow

# dump console output, page errors and failed requests for one route
node .claude/skills/run-exam-set/driver.mjs console /catalog
```

PNGs land in `.claude/skills/run-exam-set/shots/`. **Open them** — see the
opacity gotcha below for why a passing exit code is not proof the page rendered.

`shots` exits non-zero if any route returns non-200 or throws a page error.
Output per route looks like:

```
ok   200  /              "Skulbase — CBE resources for every Kenyan classroom"
ok   200  /catalog       "Catalogue — CBE exam papers, schemes of work & notes"
       http:      500 /api/papers?sort=newest&limit=24&offset=0
```

`SKULBASE_URL` points the driver at a deployed site instead of building
locally. **It does not work from this container** — the Vercel domain is
egress-blocked and every route comes back
`THREW Error: page.goto: net::ERR_CONNECTION_RESET`. The flag is there for an
environment with outbound access; do not reach for it here.

## Run — direct invocation (most PRs need only this)

The business logic is covered by 21 standalone harnesses that need no database,
no server and no network. **1,018 assertions, ~40s.** If your change is in
`src/services/`, `src/lib/` or `src/utils/`, this is the fastest real signal:

```bash
npm run verify              # all 21 suites
npm run verify:builder      # paper assembly rules
npm run verify:storage      # storage backend + CORS preflight verdicts
npm run verify:ingest       # MCP question ingest
```

They load TypeScript through `jiti`, so they import `src/` directly — a good
pattern to copy for a one-off probe of an internal function.

```bash
npx tsc --noEmit            # clean
```

## Run — human path

```bash
npm run dev                 # http://localhost:3000, hot reload
```

Useful only if you can reach the port from a browser. **`next dev` deletes
`.next/BUILD_ID`**, so run `npm run build` again before using the driver.

## Gotchas

- **Under `next dev` with no egress, pages render completely blank.**
  `src/app/layout.tsx:56` loads html2pdf from `cdnjs.cloudflare.com` with
  `strategy="beforeInteractive"`, and `src/app/template.tsx` wraps every page in
  a framer-motion `initial={{ opacity: 0 }}` that only lifts after hydration.
  In dev the blocked cdnjs response is parsed as JavaScript, throws
  `SyntaxError: Invalid or unexpected token` before hydration, React never runs,
  and you screenshot a plain background with **no error on screen**.
  Measured: 29 KB of flat colour versus 455 KB of real page.
  **The production build survives this** — `next start` renders the full page
  even with cdnjs blocked, which is one more reason the driver serves the build.
  The driver still stubs cdnjs and Google Fonts, which removes the console noise
  and keeps the dev path usable; `DRIVER_NO_STUB=1` turns the stubbing off.

- **Supabase is blocked by this container's egress allowlist.** Correct
  credentials still yield
  `Host not in allowlist: <ref>.supabase.co` and `500 /api/papers`,
  `500 /api/plans`. Layout, routing, hydration, static content and empty states
  are all verifiable locally; **live rows are not reachable from here at all** —
  not via the local server, and not via `SKULBASE_URL` against the deployment,
  which is egress-blocked too. To see real data you must add the Supabase host
  to the environment's egress settings.

- **Orphaned servers wedge port 3000.** `npm start` spawns `next-server` as a
  grandchild; signalling the wrapper alone leaves it running — observed at 121%
  CPU and 3.2 GB RSS, holding the port. Next then quietly starts the next run on
  3001 while the driver polls 3000 and times out. The driver spawns detached and
  signals the whole process group. If it ever leaks:
  ```bash
  ps aux | grep -E 'next-server|next dev' | grep -v grep | awk '{print $2}' | xargs -r kill -9
  ```

- **Do not drive this app with `next dev`.** `/set` is a 434 kB first load and
  compiles on first request; a full `flow` run against dev blew a 400-second
  budget. Against `next start` the same run takes 20s.

- **`npm run lint` reports 123 warnings and exits 0. That is the intended
  baseline, not a fault.** Linting was broken for months (`eslint-config-next`
  was never installed, so `next lint` died before reading a file). Turning it
  back on surfaced 123 pieces of accumulated style debt — 59 `no-explicit-any`,
  37 unused vars, 9 unescaped entities. Those four rules are set to `warn` in
  `eslint.config.mjs` so the backlog stays visible without failing the build;
  every other rule keeps its default severity, so a genuinely new violation is
  still an error. **If lint exits non-zero, your change introduced it.**

- **Shop pages paint skeletons first.** They server-render `.skeleton`
  placeholders and fetch rows client-side, so `networkidle` alone can capture a
  screen of grey bars. The driver waits for `.skeleton` to disappear and reports
  `N skeleton(s) still on screen` when data never arrived.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No production build found (.next/BUILD_ID missing)` | `npm run build`. A `next dev` session removes it. |
| `Server did not come up within 90s` | Orphaned server on :3000 — kill it with the `xargs` line above. |
| Screenshot is a flat background, no error | Hydration died — you are on `next dev` with cdnjs blocked. Confirm with `driver.mjs console /` (expect `SyntaxError: Invalid or unexpected token`), then use the driver's `next start` path instead. |
| `Could not load playwright from /opt/node22/lib/node_modules` | Set `NODE_GLOBAL_MODULES` to the dir holding the global install. |
| `Host not in allowlist: <ref>.supabase.co` | Expected in this sandbox. Data pages will 500; use `SKULBASE_URL` for real rows. |
| Chromium exits immediately | Running as root — the driver already passes `--no-sandbox`; keep it. |
| `Error fetching subjects: TypeError: Failed to fetch` on `/set` | Same egress block. The setter shows "The question bank could not be reached", which is correct behaviour. |

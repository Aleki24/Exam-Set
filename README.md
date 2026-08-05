# Skulbase Exams

The exam-paper arm of [Skulbase](https://github.com/Aleki24/Report-Card). A CBE exam-paper shop for Kenyan schools. The site does two things and nothing else:

1. **Sell exam papers** — `/` is the shop. Papers are organised the way a teacher
   shops: level first (Pre-Primary through Grade 12, plus legacy Form 1–4), then
   exam type, then subject, term and year. Buyers pay with M-Pesa and the PDF
   unlocks the moment payment clears.
2. **Set an exam** — `/set` is the setter. Filter the question bank, pick
   questions or auto-build to a mark target, preview the paper and its marking
   scheme, then download the PDF or save it to your library.

There is deliberately no marketing landing page: the first thing anyone sees is
the papers they can buy.

## Design

The look is inherited from Skulbase so the two products read as one family: the
same **Syne / Inter / JetBrains Mono** type stack, the same blue primary and
green counterpart, the same two-tone `Skulbase` wordmark, and the same cool
neutral surfaces and `--radius`.

The register is **quiet**: structure comes from whitespace and hairlines, not
from shadows or colour. Concretely:

- **One coloured element per card.** The action. The price is ink, the metadata is
  muted, the title carries the weight.
- **Colour is rationed.** Blue is the action colour, amber marks only the money
  moment (the price on a paper's page, Buy now, Pay, Publish), examiner's red
  marks only marks. Nothing else gets a colour.
- **Progressive disclosure.** The filter rail folds every group away and reports
  what is selected inside when closed. Grade only appears once a level is chosen.
  Applied filters are restated as removable chips above the results, so nothing
  is ever hidden without a trace.
- **Movement is minimal.** Grids settle in; nothing slides or lifts on hover
  except by a hairline of border colour.

What is specific to the exam shop sits on top of that:

- **Sheets, not cards.** Papers render as white pages on the cool ground, with a
  hairline red margin rule that inks in on hover — a nod to a real exam script.
  The whole sheet is the link, so the only button on it is the commerce action.
- **Mono overlines.** Every section label, kicker and figure is set in the mono
  face, which keeps dense metadata legible and gives the catalog an editorial
  voice.
- **Marks in examiner's red.** `--ink-red` is reserved for mark totals, errors
  and margin notes, so a mark count never reads as a price.
- **Amber for commerce only.** Prices, add-to-cart, pay and publish. Nothing
  else uses it, so the money path is always obvious.

All of it lives in `src/app/globals.css` as a token layer plus a small set of
component utilities (`.sheet`, `.chip`, `.btn-*`, `.field`, `.overline`,
`.figure`, `.rise-in`). Those utilities are wrapped in `:where()` so any Tailwind
class always wins over them, and entry animations are disabled under
`prefers-reduced-motion`.

## Who can do what

| | Browse & buy | Set exams | Upload / price / publish papers | Confirm payments | Appoint admins |
|---|---|---|---|---|---|
| **Owner** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Admin** | ✓ | ✓ | ✓ | ✓ | |
| **User** | ✓ | ✓ | | | |

Roles live in the `profiles` table. The **first account to sign up becomes the
owner**; everyone after that signs up as a user, and the owner promotes staff to
admin from `/admin` → Team. Papers a user sets stay private to them; listing a
paper for sale is an admin action.

Every rule above is enforced by Postgres row level security, not just by hidden
buttons — see `supabase/migrations/013_roles_and_sellers.sql`.

**Where the session lives.** One place on each side, deliberately:

- In the browser, `AuthProvider` in `lib/roles.tsx` is mounted once in the root
  layout and holds the answer for the whole tab. `useRole()` reads it and throws
  outside the provider rather than falling back to a lookup of its own.
- On the server, `utils/auth/guards.ts` resolves the caller once per request,
  memoised against that request's Supabase client so the memo cannot outlive the
  request that owns it. `requireUser` asks the auth server and stops there;
  `requireAdmin` and `requireOwner` also read the role, and only they return it.

This is the same rule that `utils/supabase/client` and `middleware.ts` document
at length: every serious session bug this app has had came from several things
each independently deciding who is signed in — several browser clients rotating
the refresh token out from under each other until the server treated the replay
as theft, three `getUser()` calls racing in one middleware pass. One holder, one
subscription, one answer.

**Reading the token instead of asking about it.** `getUser()` is a round trip to
the auth server on every call, and the middleware runs on every request that is
not a static file. Everything now goes through `readVerifiedClaims`
(`utils/supabase/claims.ts`), which verifies the token's signature against the
project's public keys — fetched once per process and cached — and reads the
answer out of the token.

Two things follow from that, and both are handled rather than hoped about:

- A locally verified token is trusted until it expires, so a session revoked
  server-side stays usable for the rest of the access token's life. Survivable
  here because the database is the wall: `is_admin()` and `is_owner()` read
  `profiles` inside Postgres on every statement.
- `getClaims()` *throws* where `getUser()` returned an error — an expired or
  undecodable token is an ordinary exception, not an auth error from a server.
  `readVerifiedClaims` turns that back into a value, and `isSessionRejected`
  learned the wording local verification uses, which is not the wording the auth
  server uses.

### Enabling the role claim

`037_role_in_the_access_token.sql` adds a custom access token hook that writes
`profiles.role` into the JWT as `user_role`, so `requireAdmin` can read it from a
token it has already verified instead of querying for it. **Creating the function
is not enough** — the hook has to be switched on:

- **Hosted:** Dashboard → Authentication → Hooks → *Customize Access Token (JWT)
  Claims* → select `public.custom_access_token_hook`.
- **Local:** in `supabase/config.toml`

  ```toml
  [auth.hook.custom_access_token]
  enabled = true
  uri = "pg-functions://postgres/public/custom_access_token_hook"
  ```

Until it is on, the claim is absent and the guards fall back to reading
`profiles` exactly as before. Existing sessions do the same until their next
refresh. There is no point at which anybody is locked out — a missing claim
means "ask the database", never "not an admin".

### Where emailed auth links land

Signup confirmations, invitations and password resets all point at
`/auth/callback`, and the app asks for that URL by name: `authCallbackUrl()`
builds it from `NEXT_PUBLIC_BASE_URL` so there is one canonical origin rather
than whichever hostname the browser happened to be on.

**Asking is not deciding.** GoTrue checks the requested redirect against the
project's allow-list, and when it does not match it silently substitutes the
project's *Site URL* instead — no error, no warning, just a link in somebody's
inbox that opens `http://localhost:3000` and cannot be made to work from their
phone. Both of these have to be set on the Supabase side:

- Dashboard → Authentication → URL Configuration → **Site URL** — the public
  origin, the same value as `NEXT_PUBLIC_BASE_URL`. It is the development
  default on a new project, which is why this fails in exactly the way it does.
- Dashboard → Authentication → URL Configuration → **Redirect URLs** — add
  `https://your-domain/auth/callback`, plus `http://localhost:3000/auth/callback`
  for local development. Note that `example.com` and `www.example.com` are two
  different entries as far as this list is concerned.

`GET /api/health` reports `authRedirectUrl`: the exact string that has to appear
in that list. If a confirmation link goes somewhere unexpected, compare the two
before looking anywhere else.

The claim is a photograph of the role when the token was minted, so it can be up
to one token lifetime out of date. Routes that hold a service-role client bypass
row level security and have no database wall behind them, so they pass
`{ fresh: true }` and `requireOwner` always reads the table. Everything else can
afford to be briefly wrong on screen, because the write behind it is refused by
Postgres.

**RLS policies are OR'd together**, so a single permissive policy anywhere
defeats every strict one on the same table. Migration `016_tighten_rls.sql`
removes the `FOR ALL USING (true)` policies the early migrations shipped; without
it, anyone holding the anon key — which is public by design, it ships in the
frontend bundle — could reprice papers, publish into the shop, read unpublished
drafts, or delete the question bank. If you add a policy, check
`get_advisors(type: 'security')` afterwards.

## Routes

| Route | What it is |
|---|---|
| `/` | The shop: browse, filter and add papers to the cart |
| `/papers/[id]` | One paper: what you get, price, buy or download |
| `/papers/new` | Upload a paper for sale (admin) |
| `/set` | The exam setter |
| `/cart` | Cart and M-Pesa checkout in one page |
| `/plans` | All-access subscriptions. Deliberately not in the navigation — reached from the cart and the library, where a pass is the better buy |
| `/library` | Papers you own, papers you set, your receipts |
| `/admin` | Payments queue, catalog and pricing, team |
| `/admin/questions`, `/admin/topics`, `/admin/templates` | Question-bank tooling |
| `/api/health` | Public, unauthenticated: says in one line whether this deployment can reach its database |
| `/api/whatsapp/webhook` | The WhatsApp bot. Signature-verified; rejects anything Meta did not sign |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Apply the migrations in `supabase/migrations/` in order. The ones that matter for
the shop are:

- `012_paper_shop.sql` — turns `exams` into a sellable catalog and adds orders,
  order items and entitlements
- `013_roles_and_sellers.sql` — the owner/admin/user roles and who may sell
- `017_subscriptions.sql` — the all-access pass
- `020_whatsapp.sql` — bot session state, message dedupe, and the fix that makes
  `handle_new_user` copy the phone number onto the profile (without it, an
  account created from a phone can never be found again)
- `018_lock_down_settlement_functions.sql` — closes EXECUTE on the functions that
  settle payments. Postgres grants EXECUTE to PUBLIC by default and Supabase adds
  `anon`/`authenticated` on top, which left `confirm_order_payment` callable by
  any visitor — a complete bypass of the paywall

**Deploying to an existing database?** `supabase/production-setup.sql` is a
concatenation of the migrations, ready to paste into the Supabase SQL editor in
one go — but it currently stops at `021_schema_drift.sql` and has not been
regenerated since. Apply `022` onwards from `supabase/migrations/` yourself.
It is safe to re-run. Two things it does that you should know about: every exam
currently marked `is_public` becomes a published free catalog paper (reprice them
from `/admin` → Catalog), and the first account to sign up becomes the owner.

### Payments

M-Pesa runs in one of two modes, decided by whether the Daraja credentials are
present in the environment:

- **STK push** (`MPESA_CONSUMER_KEY` and friends set) — the payment request goes
  to the buyer's phone and `POST /api/mpesa/callback` settles the order. This
  needs `SUPABASE_SERVICE_ROLE_KEY`, because Safaricom's callback carries no user
  session.
- **Manual confirmation** (credentials absent) — the buyer pays to the paybill
  shown at checkout, submits their transaction code, and an admin confirms it
  from `/admin` → Payments.

Either way a download is only ever released against a row in `entitlements` or a
live subscription, and only `confirm_order_payment` / `admin_confirm_order` can
create either. A browser cannot mark its own order paid: buyers have no `UPDATE`
policy on `orders`, and `EXECUTE` on the settlement functions is restricted to
the service role.

### Subscriptions

An all-access pass, sold through the same orders table and the same M-Pesa flow
as a single paper — an order carries *either* a basket of papers or one
`plan_slug`, never both. Prices live in the `subscription_plans` table rather
than in code, so they can change without a deploy.

Access is decided in one place, `can_download_paper(exam_id, user_id)`: free
papers, papers you wrote, papers you bought, or a live subscription. Every route
that releases a file asks that one question, so the paywall cannot drift apart
between them.

Renewing while a pass is still running extends it from the current expiry rather
than from today, so paying early never costs days. Nothing runs on a schedule, so
every check reads `expires_at` instead of trusting the `status` column to be
current.

Plans are deliberately not split by subject: it would double the pricing surface
and the support burden for a catalogue this size.

### How a paper becomes a file

There are two kinds of paper in the shop and only one arrives with a PDF:

- **Uploaded** — an admin attached the file. Nothing to do.
- **Set** — built in the setter from the question bank. It is a list of question
  ids, so it has no file at all.

A set paper is rendered from its questions the first time anyone asks for it,
stored, and recorded on the row — generated once, and identical to an uploaded
paper ever after. That keeps a single delivery path: every route downstream signs
a storage key and knows nothing about where the file came from.

`services/paperPdf.ts` lays the page out with jsPDF text primitives rather than
rasterising HTML. Real text is a fiftieth of the size of a screenshot, prints
sharp on a staffroom photocopier, stays searchable, and needs no browser on the
server — which matters inside a serverless request. A sixty-question paper is
about 24 KB; the same paper as page images ran to several megabytes.

`services/paperLayout.ts` decides the *shape* of the paper — sections, numbering,
cleaned text, how much room each answer needs, the examiner's mark table, the
rubric — and both the PDF and the on-screen preview are drawn from it. That is
the point of it existing: the paper a teacher approves in the setter and the file
that downloads are the same document, rather than two descriptions of it that
drift apart.

The layout follows the conventions of a Kenyan end-of-term paper, because it gets
photocopied for a class:

- centred school name and title, a details line, a candidate box for name, admission
  number, class and date;
- numbered instructions, ending with the printed-page count every KNEC paper
  carries — which is why the document is rendered twice, the first pass only to
  find out how many pages there are;
- a filled *For Examiner's Use Only* table, banded ten questions at a time once a
  paper is long enough that a column per question stops being a table;
- for CBC levels, the four performance bands with the marks each one means for
  *this* paper. An empty four-box grid is a picture of a rubric, not one a
  teacher can mark against;
- objective questions set as Section A and structured ones as Section B — but only
  when the paper is already ordered that way. Reordering somebody's paper to fit a
  convention would be worse than not having the convention;
- questions with marks in the right margin, lettered options set two to a line
  when they are short, labelled sub-parts, and ruled answer space scaled to the
  marks rather than a fixed two lines under a ten-mark essay.

Three rules the renderer holds to, each of which was previously broken:

- **Black on white, nothing grey.** A photocopy of grey text is an unreadable page.
- **The same header on every page** — subject, level, paper, *Page X of Y* — so a
  sheet that comes loose can be put back.
- **No blank or nearly empty pages.** A question's stem never ends up stranded at
  the foot of a page, long questions are allowed to run over the break rather than
  restart overleaf, and when a paper spills a little way onto a last page it is set
  again with slightly less writing space and kept only if that buys the page back.
  A near-empty sheet is still a sheet per pupil in a class of forty.

The marking scheme is a separate document, not an appendix — it is sold and
delivered separately, and a teacher handing out the paper must not hand out the
answers with it.

`scripts/verify-paper-pdf.mjs` inflates the rendered file and reads the page
content back, so those rules are checked against what the PDF actually draws
rather than against the code that meant to draw it.

### The WhatsApp bot

A teacher texts *"form 4 mathematics term 3"* and the PDF comes back. No
browsing, no account, no checkout — which is the point, because most teachers
already live in WhatsApp and will not create an account to find out whether you
have what they need.

Optional. Leave the four `WHATSAPP_*` variables unset and the webhook returns 503
while the rest of the app carries on unchanged.

**How a request is understood.** `src/services/paperQuery.ts` matches the message
against the catalog vocabulary — grades, subjects, exam types, terms, years —
rather than calling a language model. The vocabulary is closed and small, so a
matcher is instant, free, identical every time, and can say precisely which part
it did not understand. A model would put a network round trip and a bill in front
of the most common request on the platform and could still invent a subject that
is not stocked. Words it does not recognise are dropped rather than passed
through as a search term, so "i want" and "please" cost nothing.

When several papers match, the bot asks with a list instead of guessing — a wrong
guess ends with the wrong PDF delivered to someone who paid for it. When nothing
matches exactly it widens the search one filter at a time (year, then term, then
exam type) and says what it ignored. Grade and subject are never dropped.

**Paying.** The bot's paid path is the subscription, not single papers. Anything
free, already owned, or covered by a live plan is sent immediately; anything else
offers the cheapest plan and pushes an M-Pesa prompt to the same number. Payment
settles through the existing callback, and the paper the buyer was waiting for is
delivered on confirmation. Every request after that is instant.

**Identity.** The first purchase silently creates an account for that phone
number, so the papers are waiting in `/library` if they ever visit the website.
`can_download_paper` governs chat and web alike, so a paper locked in one is
locked in the other.

**Security.** The webhook is public and hands out paid PDFs, so it is treated as
hostile until proven otherwise:

- Every delivery must carry a valid `X-Hub-Signature-256`, checked against the
  raw bytes with `WHATSAPP_APP_SECRET` before the body is parsed. Re-serialised
  JSON does not reproduce Meta's bytes and would reject every request, which is
  why the route reads `req.text()` first.
- Every message id is claimed in `whatsapp_messages` before it is acted on. Meta
  retries until it gets a 200, and a retry on a delivery path means a second copy
  of a paid paper.
- `whatsapp_sessions` and `whatsapp_messages` have RLS enabled with no policies
  at all. Only the service role touches them, and it bypasses RLS — so nobody
  holding the publishable key can read another person's conversation. This is the
  opposite of the app tables, where RLS without policies would lock users out.
- 25 messages per number per hour.

### Paper files

Storage is pluggable, and the backend is chosen from the environment by
`src/utils/storage.ts`:

- **Supabase Storage** — the default. Needs nothing beyond
  `SUPABASE_SERVICE_ROLE_KEY`, which the M-Pesa callback already requires, plus
  migration `014_storage_bucket.sql` to create the private `exam-papers` bucket.
  No second vendor, no extra bill.
- **Cloudflare R2** — set all four `R2_*` variables and it takes over
  automatically. Worth doing once download volume grows, since R2 egress is free.

Either way nothing is public. Uploads go through `POST /api/papers/upload` behind
an admin check, and `GET /api/papers/[id]/download` verifies entitlement before
minting a 15-minute signed URL. With neither backend configured those routes
return 503 with a message naming the variables to set — the rest of the site
(shop, setter, sign-up, admin) works normally.

## The exam-setting logic

The selection rules live in `src/services/paperBuilder.ts`, split so they can be
reasoned about:

- `assemblePaper(pool, blueprint, existing)` is **pure**. Given a mark target and
  a difficulty mix it fills the paper, never exceeding the target, never
  repeating a question, preferring questions used least, and reporting an honest
  shortfall when the bank is too thin.
- `fetchQuestionPool(filters)` is the only part that touches the database, and it
  pages through every match instead of stopping at the first 50 rows — picking 40
  questions out of a bank of 900 is impossible otherwise.
- Marks come from a question's sub-parts when it has them, so a structured
  question with a stale top-level mark still totals correctly.

Run the checks:

```bash
npm run verify          # both suites
npm run verify:builder  # paper assembly rules
npm run verify:storage  # storage backend selection
```

`verify:builder` exercises mark targets, the difficulty mix, topic and type
restrictions, duplicate avoidance, sub-part arithmetic and graceful degradation
against a synthetic bank. `verify:storage` covers which backend is chosen from
the environment, including a partial R2 config, which must fall back to Supabase
rather than fail at runtime. Neither needs a database.

## Adding a new exam type or level

Both are data, in `src/lib/catalog.ts`. Add an entry to `EXAM_TYPES` or `LEVELS`
and it appears immediately in the shop's filter rail, the setter and the upload
form. Nothing else needs to change.

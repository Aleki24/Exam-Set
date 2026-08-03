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
| `/account` | Who you are, what you teach or study, and linking your WhatsApp number |
| `/admin` | Payments queue, catalog and pricing, team |
| `/admin/questions`, `/admin/topics`, `/admin/templates` | Question-bank tooling |
| `/admin/whatsapp` | Conversations waiting for a person, longest wait first |
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
- `033_whatsapp_commerce.sql` — the in-chat cart, conversation state, the outbox
  that survives the 24-hour window, and account link codes
- `034_account_merge.sql` — joining a phone account to a website account without
  losing the papers that overlap
- `035_delivery_claims.sql` — one delivery per order, enforced by a primary key
  rather than by a hopeful read
- `036_outbound_tracking.sql` — what was sent and whether it landed, so a failed
  PDF is re-queued instead of disappearing
- `018_lock_down_settlement_functions.sql` — closes EXECUTE on the functions that
  settle payments. Postgres grants EXECUTE to PUBLIC by default and Supabase adds
  `anon`/`authenticated` on top, which left `confirm_order_payment` callable by
  any visitor — a complete bypass of the paywall

**Deploying to an existing database?** `supabase/production-setup.sql` concatenates
migrations **012–022** — the shop, roles, storage, subscriptions and the original
bot — ready to paste into the Supabase SQL editor in one go. It is safe to re-run.
Two things it does that you should know about: every exam currently marked
`is_public` becomes a published free catalog paper (reprice them from `/admin` →
Catalog), and the first account to sign up becomes the owner.

It stops at 022. Everything after it — the resource library, progress, marking,
assignments, CBA capture and the WhatsApp shop — is applied from
`supabase/migrations/` in numeric order. That directory is the source of truth;
the concatenated file is a convenience for a first deployment, not a substitute.

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
rasterising HTML. Real text is a tenth of the size of a screenshot, prints sharp
on a staffroom photocopier, stays searchable, and needs no browser on the
server — which matters inside a serverless request. The layout follows the
conventions of a Kenyan paper because it gets photocopied for a class: centred
school name and title, a details line, numbered instructions, questions with
marks in the right margin, lettered options, labelled sub-parts, and ruled answer
space scaled to the marks rather than a fixed two lines under a ten-mark essay.

The marking scheme is a separate document, not an appendix — it is sold and
delivered separately, and a teacher handing out the paper must not hand out the
answers with it.

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

**Browsing without typing.** `MENU` opens an interactive list: browse by level,
search, my papers, my orders, set your own exam, talk to a person. Levels lead to
subjects lead to papers, each a tap. Typing still works everywhere, so somebody
who knows what they want never sees the menu — the fastest path stays the fastest
path.

**Getting it again.** `MY PAPERS` lists what you own; `MY ORDERS` lists receipts,
and picking one resends everything that order bought. A reference typed straight
in works too — `resend order EX8ZK3AB2C`, or just the reference — because that
string is already in front of the customer, on the receipt and in the M-Pesa
message. Order lookups are scoped to the account: a reference is short and
guessable, and an unscoped lookup is a way to read somebody else's purchases by
typing until something matches. There is no charge and no limit beyond the rate
limit; the files are already theirs.

**Paying for one paper.** The chat has a cart. Add papers, see the running total,
confirm the exact figure, and an M-Pesa prompt goes to the same handset. The
confirmation step is not optional: an unexpected STK prompt is how a customer
learns to distrust the number.

A chat purchase writes an ordinary `orders` row with `channel = 'whatsapp'` plus
`order_items` — exactly what the website's cart produces. `confirm_order_payment`
then mints entitlements, `can_download_paper` reads them, and `/library` lists
them, all untouched. A chat purchase and a web purchase are the same purchase,
which is the only way the two can show the same history.

Anything free, already owned, or covered by a live plan skips payment entirely
and is sent immediately. A free paper must never reach a checkout: charging
nothing is still a payment prompt, and a payment prompt for a free paper is a
broken shop.

**Identity, and linking.** The first purchase silently creates an account for
that phone number, so the papers are waiting in `/library` if they ever visit the
website. Somebody who already has a website account can join the two: `/account`
issues a six-character code, good for fifteen minutes and one use, and sending it
to the bot merges the accounts. Matching on a typed email was the obvious
alternative and is an account takeover with two words of typing — knowing
somebody's address proves nothing about owning it.

The merge is `merge_whatsapp_account` (migration 034), and it exists because the
obvious one-liner was measurably wrong. `entitlements` carries
`UNIQUE (user_id, exam_id)`, so a blanket `UPDATE … SET user_id` aborts entirely
if the website account already owns even one of the papers — and a failed UPDATE
in Postgres rolls back *all* the rows, not the colliding one. The customer saw
"Linked ✅" while every chat purchase stayed on an account they could not sign
into.

**The 24-hour rule.** WhatsApp refuses a free-form message more than 24 hours
after the customer last wrote. Almost every purchase completes in seconds, but an
STK prompt answered the next morning confirms outside that window — and a
rejected send inside a payment callback is somebody who has been charged and
received nothing. So a delivery that cannot be sent goes to `whatsapp_outbox` and
flushes the moment that number writes again. Set `WHATSAPP_TEMPLATE_DELIVERY` to
an approved Meta template and they are nudged immediately instead; without one,
nothing is lost, only delayed.

**Did it actually arrive?** A 200 from Meta's send endpoint means the message was
accepted, not delivered. A document can fail minutes later — the signed link
expired before Meta fetched it, the file is over 100 MB, the number blocked the
business — and that failure arrives as a status report on the same webhook. The
bot used to discard both the message id and the reports, so a paid paper could
fail silently after the customer had been told "sent ✅". Now every document send
is recorded in `whatsapp_outbound`, a `failed` report puts the paper back on the
outbox, and if it was paid for the conversation goes to `/admin/whatsapp`.

**When the bot cannot help.** Asking for a person flags the conversation and the
bot goes quiet — nothing is worse than a bot talking over a real conversation.
`/admin/whatsapp` is the other half of that promise: who is waiting, for how
long, what is in their cart, whether WhatsApp will still accept a reply, and a
box to answer from. Longest wait first, because a queue sorted by newest is one
where whoever has waited all morning is never reached.

**Security.** The webhook is public and hands out paid PDFs, so it is treated as
hostile until proven otherwise:

- Every delivery must carry a valid `X-Hub-Signature-256`, checked against the
  raw bytes with `WHATSAPP_APP_SECRET` before the body is parsed. Re-serialised
  JSON does not reproduce Meta's bytes and would reject every request, which is
  why the route reads `req.text()` first.
- Every message id is claimed in `whatsapp_messages` before it is acted on. Meta
  retries until it gets a 200, and a retry on a delivery path means a second copy
  of a paid paper.
- Every paid delivery is claimed in `whatsapp_deliveries`, whose primary key *is*
  the lock (migration 035). The M-Pesa callback's `status === 'paid'` guard is a
  read followed by a write with a network round trip in between, and two
  Safaricom retries landing inside that gap both pass it. Checking harder does
  not make a check atomic. An incomplete claim can be taken over after ten
  minutes, so a process that dies mid-delivery delays a paid order rather than
  stranding it for ever.
- `merge_whatsapp_account`, `claim_order_delivery`, `complete_order_delivery` and
  `release_order_delivery` are `SECURITY DEFINER` and have EXECUTE revoked from
  `PUBLIC`, `anon` and `authenticated`. Postgres grants EXECUTE to PUBLIC by
  default, so those REVOKEs are load-bearing: an exposed `merge_whatsapp_account`
  is "move any account's papers onto mine" in a single RPC.
- `account_link_codes` has RLS with a select-your-own policy and no insert policy
  at all, so nobody can mint a code pointing at somebody else's account.
  `whatsapp_outbox` and `whatsapp_deliveries` have RLS with no policies — service
  role only.
- `whatsapp_sessions` and `whatsapp_messages` have RLS enabled with no policies
  at all. Only the service role touches them, and it bypasses RLS — so nobody
  holding the publishable key can read another person's conversation. This is the
  opposite of the app tables, where RLS without policies would lock users out.
- 40 messages per number per hour. Raised from 25 when the bot gained a menu:
  browsing is several taps where searching was one message, and a limit that
  cuts somebody off mid-purchase is worse than no limit at all.

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

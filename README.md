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
| `/library` | Papers you own, papers you set, your receipts |
| `/admin` | Payments queue, catalog and pricing, team |
| `/admin/questions`, `/admin/topics`, `/admin/templates` | Question-bank tooling |

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

**Deploying to an existing database?** `supabase/production-setup.sql` is those
two concatenated in order, ready to paste into the Supabase SQL editor in one go.
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

Either way a download is only ever released against a row in `entitlements`, and
only `confirm_order_payment` / `admin_confirm_order` can create one. A browser
cannot mark its own order paid: buyers have no `UPDATE` policy on `orders` at
all.

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

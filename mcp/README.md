# Skulbase MCP server

Lets Claude write questions into the bank while you talk to it, instead of you
copying them somewhere by hand.

## Setup

1. **Mint a key.** `/admin` → Ingest keys → give it a name. It is shown once.
2. **Install and register:**

```bash
cd mcp && npm install

claude mcp add skulbase \
  --env SKULBASE_URL=https://your-site \
  --env SKULBASE_INGEST_KEY=skb_ingest_… \
  -- node "$(pwd)/server.mjs"
```

## Using it

> Look at what Skulbase already covers, then write 20 Grade 7 Integrated Science
> questions on the strand with the fewest, each with a marking scheme.

Claude calls `list_curriculum` to see the gaps, then `submit_questions`. The
questions land **pending**; you approve them in `/admin` before they can appear
in anything sold.

## Tools

| Tool | What it does |
|---|---|
| `list_curriculum` | Subject and grade names the site recognises, plus how many approved and pending questions each pairing already holds. |
| `submit_questions` | Up to 50 questions, each requiring a marking scheme. Returns what was accepted and, per rejected question, why. |
| `attach_figure` | A diagram for a question that already exists, sent inline as base64. JPG, PNG or WebP up to 3 MB. Set `required` when the question cannot be answered without it. |

### Figures

A large share of a Kenyan science or maths paper is unanswerable as text — a
velocity-time graph, a ray diagram, a map extract. The extractor takes the words
and leaves the picture, so `attach_figure` is how the picture gets put back
without a person dragging a file into `/admin/review` for every question.

The bytes go inline rather than through a presigned URL. The browser upload does
use one, because a multipart POST dies at Vercel's ~4.5 MB body limit — but a
program has the opposite problem: presigning is a second round trip to a second
host, and a caller allowed to reach this app may well not be allowed to reach
the storage endpoint. Hence the 3 MB ceiling, which is 4 MB once base64 has
added its third. A figure is a crop of one diagram; the ones this was built for
are tens of kilobytes.

`required: true` records that the question *is* the figure. A question flagged
that way with no image attached is refused by `POST /api/papers`, so it can
never be sold as a blank space.

## What it deliberately cannot do

No publishing, no pricing, no orders, no entitlements, no buyer's library. The
key has the same limits server-side, so a laptop that walks out of the building
costs you a revoked key and nothing else.

A marking scheme is required on every question. 203 of the first 253 questions
in this bank arrived without one, and each prints *"No marking scheme recorded
for this question"* onto a document somebody paid for.

## Why questions and not a finished PDF

The renderer here already lays out a Kenyan paper properly — examiner's table,
CBE rubric, name and admission boxes, black text at about five kilobytes.
Sending structured questions means every generated paper looks like every other
paper in the shop, the marking scheme is built from the same data rather than a
second file that can disagree with it, and a typo is one field to fix rather
than a document to remake.

It also means the question is stock. A question in the bank is sold many times
over — in a generated paper, in a topical set, in the setter, in practice. A PDF
is sold once.

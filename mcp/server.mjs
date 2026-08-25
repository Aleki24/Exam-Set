#!/usr/bin/env node
/**
 * SKULBASE MCP SERVER
 *
 * Lets Claude write questions into the bank while you talk to it, instead of
 * you copying them somewhere by hand.
 *
 *   claude mcp add skulbase -- node /path/to/mcp/server.mjs
 *
 * Two environment variables:
 *   SKULBASE_URL        https://your-site
 *   SKULBASE_INGEST_KEY skb_ingest_…   (minted in /admin)
 *
 * WHAT THIS DELIBERATELY CANNOT DO
 *
 * It submits questions for review and reads back what the shop already holds.
 * It cannot publish, cannot price, cannot touch orders, entitlements or a
 * buyer's library. The key it carries has the same limits server-side, so a
 * laptop that walks out of the building costs you a revoked key and nothing
 * else.
 *
 * Everything it writes lands `pending`. A person approves it in /admin before
 * it can appear in anything that is sold. That is not a limitation to be
 * engineered around later — it is the whole reason it is safe to let a model
 * write into a shop at all.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const BASE = (process.env.SKULBASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SKULBASE_INGEST_KEY || '';

if (!BASE || !KEY) {
    console.error(
        'skulbase-mcp: set SKULBASE_URL and SKULBASE_INGEST_KEY.\n' +
            'Mint a key in /admin → Ingest keys.'
    );
    process.exit(1);
}

const QUESTION_SCHEMA = {
    type: 'object',
    required: ['text', 'marks', 'marking_scheme', 'topic'],
    properties: {
        text: { type: 'string', description: 'The question as a candidate reads it. No numbering — the renderer adds it.' },
        marks: { type: 'integer', minimum: 1, maximum: 100 },
        marking_scheme: {
            type: 'string',
            description:
                'The answer, with how the marks are split. Required — a question with no answer cannot be sold, ' +
                'and it is what the printed marking scheme is made from.',
        },
        topic: {
            type: 'string',
            description:
                'The KICD strand, e.g. "Algebra", "Living Things". Reuse a spelling from `topics_in_use` in ' +
                'list_curriculum whenever one fits — the shop filters on this exact string, so a synonym ' +
                'silently creates a second strand nothing will match.',
        },
        subtopic: { type: 'string' },
        subject: { type: 'string', description: 'Learning area, e.g. "Mathematics". Matched loosely against the catalogue.' },
        grade: { type: 'string', description: 'e.g. "Grade 9".' },
        difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Difficult'] },
        type: {
            type: 'string',
            enum: ['Multiple Choice', 'True/False', 'Matching', 'Fill-in-the-blank', 'Numeric',
                   'Structured', 'Short Answer', 'Essay', 'Practical', 'Oral'],
        },
        options: { type: 'array', items: { type: 'string' }, description: 'Required for Multiple Choice — at least two.' },
        answer_lines: { type: 'integer', description: 'Ruled lines to print for the answer.' },
        blooms_level: {
            type: 'string',
            enum: ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'],
        },
    },
};

const TOOLS = [
    {
        name: 'submit_questions',
        description:
            'Submit questions to the Skulbase bank for review. Every question needs a marking scheme. ' +
            'They land pending and a person approves them in /admin before they can be sold. ' +
            'Up to 50 at a time.',
        inputSchema: {
            type: 'object',
            required: ['questions'],
            properties: {
                questions: { type: 'array', minItems: 1, maxItems: 50, items: QUESTION_SCHEMA },
            },
        },
    },
    {
        name: 'attach_figure',
        description:
            "Attach a diagram to a question that already exists in the bank. A large share of a Kenyan " +
            'science or maths paper is unanswerable as text — a velocity-time graph, a ray diagram, a map ' +
            'extract — and the question is worthless without the picture. Send the image inline as base64. ' +
            'JPG, PNG or WebP, up to 3 MB; crop to the diagram itself. Set required=true when the question ' +
            'cannot be answered without it, which keeps it out of any paper until the figure is there. ' +
            'Attaching a figure does not approve a question.',
        inputSchema: {
            type: 'object',
            required: ['question_id', 'content_type', 'data_base64'],
            properties: {
                question_id: { type: 'string', description: 'UUID of the question, as returned by submit_questions.' },
                content_type: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] },
                data_base64: { type: 'string', description: 'The image bytes, base64. A data: prefix is accepted.' },
                caption: { type: 'string', description: 'Printed under the figure, e.g. "Figure 1".' },
                required: {
                    type: 'boolean',
                    description: 'True when the question cannot be answered without the figure.',
                },
            },
        },
    },
    {
        name: 'list_curriculum',
        description:
            'The subjects and grades this Skulbase instance knows about, the topics (KICD strands) already in ' +
            'use, and how many approved questions each subject, grade and topic holds. Call this before writing ' +
            'questions: it gives the exact subject and grade spellings the site recognises, the topic spellings ' +
            'the shop filters on, and — per pairing, thinnest first — which strands are short. Write toward those.',
        inputSchema: { type: 'object', properties: {} },
    },
];

const server = new Server({ name: 'skulbase', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === 'submit_questions') return text(await post('/api/ingest/questions', args));
        if (name === 'attach_figure') {
            return text(
                await post('/api/ingest/figures', {
                    questionId: args?.question_id,
                    contentType: args?.content_type,
                    dataBase64: args?.data_base64,
                    caption: args?.caption,
                    required: args?.required,
                })
            );
        }
        if (name === 'list_curriculum') return text(await get('/api/ingest/curriculum'));
        return text({ error: `Unknown tool: ${name}` }, true);
    } catch (err) {
        // Returned as content rather than thrown: the model can read a message
        // and correct itself, where a protocol error just ends the turn.
        return text({ error: err instanceof Error ? err.message : String(err) }, true);
    }
});

async function post(path, body) {
    const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
    return data;
}

async function get(path) {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${KEY}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
    return data;
}

function text(payload, isError = false) {
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError };
}

await server.connect(new StdioServerTransport());

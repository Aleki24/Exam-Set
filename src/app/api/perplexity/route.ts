import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.PERPLEXITY_API_KEY || process.env.NEXT_PUBLIC_PERPLEXITY_API_KEY || '';
const API_URL = 'https://api.perplexity.ai/chat/completions';

export async function POST(request: NextRequest) {
    if (!API_KEY) {
        return NextResponse.json(
            { error: 'Perplexity API Key is not configured' },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: body.model || 'sonar',
                messages: body.messages,
                temperature: body.temperature || 0.2,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Perplexity API Error:', errorData);
            return NextResponse.json(
                { error: `Perplexity API Error: ${response.status}`, details: errorData },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Perplexity proxy error:', error);
        return NextResponse.json(
            { error: 'Failed to communicate with Perplexity API', details: error.message },
            { status: 500 }
        );
    }
}

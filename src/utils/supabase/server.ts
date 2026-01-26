import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const createClient = async () => {
    const cookieStore = await cookies();

    return createServerClient(
        supabaseUrl!,
        supabaseKey!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
            // Custom fetch with increased timeout (30s) and retry logic
            global: {
                fetch: async (url, options) => {
                    const MAX_RETRIES = 3;
                    const BASE_DELAY = 1000; // 1 second

                    for (let i = 0; i < MAX_RETRIES; i++) {
                        try {
                            return await fetch(url, {
                                ...options,
                                // @ts-ignore
                                duplex: 'half', // Required for Node.js fetch
                                signal: AbortSignal.timeout(30000), // 30 second timeout
                            });
                        } catch (error: any) {
                            const isLastAttempt = i === MAX_RETRIES - 1;
                            if (isLastAttempt) throw error;

                            // Retry on connection errors or timeouts
                            if (
                                error.name === 'ConnectTimeoutError' ||
                                error.name === 'TypeError' && error.message === 'fetch failed' ||
                                error.code === 'UND_ERR_CONNECT_TIMEOUT'
                            ) {
                                console.warn(`Supabase fetch failed (attempt ${i + 1}/${MAX_RETRIES}). Retrying...`);
                                await new Promise(resolve => setTimeout(resolve, BASE_DELAY * Math.pow(2, i)));
                                continue;
                            }

                            throw error;
                        }
                    }
                    throw new Error('Supabase fetch failed after retries');
                }
            }
        },
    );
};

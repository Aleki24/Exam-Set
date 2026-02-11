import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const createClient = () => {
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase Environment Variables!', {
            url: supabaseUrl,
            key: supabaseKey ? 'Set' : 'Missing'
        });
    }
    return createBrowserClient(
        supabaseUrl!,
        supabaseKey!,
    );
};

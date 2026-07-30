import { redirect } from 'next/navigation';

/**
 * The old builder lived here. There is one setter now, at /set, so this route
 * exists only to keep old links and bookmarks working.
 */
export default function LegacyBuilderRedirect() {
    redirect('/set');
}

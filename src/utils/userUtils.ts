/**
 * Formats an email prefix into a human-readable display name.
 * - Removes numbers
 * - Replaces separators (., _, -) with spaces
 * - Capitalizes each word
 */
export function formatDisplayName(email: string | undefined | null): string {
    if (!email) return 'User';

    // Get the part before the @ symbol
    let namePart = email.split('@')[0];

    // Remove all numbers
    namePart = namePart.replace(/[0-9]/g, '');

    // Replace common separators with spaces
    // This handles cases like alex.otieno, alex_otieno, alex-otieno
    namePart = namePart.replace(/[._-]/g, ' ');

    // If there's no space but the name is long, it's hard to split perfectly without a dictionary.
    // However, we'll capitalize what we have.

    return namePart
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Gets initials from a display name
 */
export function getInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(n => n[0]?.toUpperCase())
        .join('');
}

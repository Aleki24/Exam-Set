/**
 * Common first names used to detect word boundaries in concatenated email usernames.
 * This list covers many common names; add more as needed.
 */
const COMMON_FIRST_NAMES = new Set([
    'alex', 'alice', 'andrew', 'anna', 'brian', 'carol', 'charles', 'chris',
    'dan', 'daniel', 'david', 'diana', 'edward', 'emma', 'eric', 'faith',
    'frank', 'george', 'grace', 'hannah', 'henry', 'ian', 'irene', 'isaac',
    'jack', 'james', 'jane', 'janet', 'jason', 'jean', 'jeff', 'jennifer',
    'jessica', 'john', 'joseph', 'joy', 'julia', 'karen', 'kate', 'kevin',
    'laura', 'lewis', 'lily', 'linda', 'lucy', 'mark', 'martin', 'mary',
    'michael', 'moses', 'nancy', 'nicholas', 'nick', 'oliver', 'oscar',
    'patricia', 'patrick', 'paul', 'peter', 'rachel', 'rebecca', 'richard',
    'robert', 'rose', 'ruth', 'ryan', 'samuel', 'sarah', 'simon', 'stephen',
    'steve', 'susan', 'thomas', 'tom', 'victor', 'victoria', 'vincent',
    'william', 'wilson',
    // Add Kenyan/African common names
    'otieno', 'ochieng', 'odhiambo', 'onyango', 'wambui', 'kamau', 'njoroge',
    'mwangi', 'kipchoge', 'chebet', 'korir', 'akinyi', 'adhiambo', 'awino',
    'atieno', 'nekesa', 'wafula', 'simiyu', 'barasa', 'juma', 'hassan',
    'omar', 'abdi', 'amina', 'fatuma', 'halima',
]);

/**
 * Attempts to split a concatenated name string into separate words.
 * e.g., 'alexotieno' → 'alex otieno'
 * 
 * Strategy:
 * 1. Try to find a known first name at the start of the string.
 * 2. If found, split there and check if the remainder is also a known name.
 * 3. If no known name match, split roughly in the middle for long strings.
 */
function splitConcatenatedName(name: string): string {
    const lower = name.toLowerCase();

    // If it's short (≤ 4 chars), don't try to split
    if (lower.length <= 4) return name;

    // Try to find a matching first name from longest to shortest
    // Sort potential matches by length (longer matches first) to avoid false splits
    const sortedNames = Array.from(COMMON_FIRST_NAMES).sort((a, b) => b.length - a.length);

    for (const firstName of sortedNames) {
        if (lower.startsWith(firstName) && lower.length > firstName.length) {
            const remainder = lower.slice(firstName.length);
            // Only split if remainder is at least 2 chars
            if (remainder.length >= 2) {
                return `${firstName} ${remainder}`;
            }
        }
    }

    // Fallback: if name is long enough, try to split roughly in the middle
    // at a consonant-vowel boundary
    if (lower.length >= 6) {
        const vowels = 'aeiou';
        const mid = Math.floor(lower.length / 2);
        // Search around the middle for a good split point
        for (let offset = 0; offset <= 3; offset++) {
            for (const pos of [mid + offset, mid - offset]) {
                if (pos > 2 && pos < lower.length - 2) {
                    // Split at consonant→vowel boundary
                    if (!vowels.includes(lower[pos - 1]) && vowels.includes(lower[pos])) {
                        return `${lower.slice(0, pos)} ${lower.slice(pos)}`;
                    }
                }
            }
        }
    }

    return name;
}

/**
 * Formats an email prefix into a human-readable display name.
 * - Removes numbers
 * - Replaces separators (., _, -) with spaces
 * - Splits concatenated names (e.g., alexotieno → Alex Otieno)
 * - Capitalizes each word
 * 
 * Examples:
 *   alexotieno293@gmail.com → Alex Otieno
 *   alex.otieno@gmail.com   → Alex Otieno
 *   alex_otieno@gmail.com   → Alex Otieno
 */
export function formatDisplayName(email: string | undefined | null): string {
    if (!email) return 'User';

    // Get the part before the @ symbol
    let namePart = email.split('@')[0];

    // Remove all numbers
    namePart = namePart.replace(/[0-9]/g, '');

    // Replace common separators with spaces
    namePart = namePart.replace(/[._-]/g, ' ');

    // Trim any trailing/leading whitespace from removed chars
    namePart = namePart.trim();

    // If there are already spaces (from separators), just capitalize
    // If not, try to split the concatenated name
    if (!namePart.includes(' ')) {
        namePart = splitConcatenatedName(namePart);
    }

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

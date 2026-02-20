import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function normalizePhone(input: string): string {
    // 1. Remove all non-numeric characters (spaces, dashes, dots, etc)
    let clean = input.replace(/\D/g, '');

    // 2. If starts with '08', replace '0' with '62'
    if (clean.startsWith('08')) {
        clean = '62' + clean.substring(1);
    }
    // Handle case where user inputs '8...' directly (common shorthand)
    else if (clean.startsWith('8')) {
        clean = '62' + clean;
    }

    // Add 62 if it doesn't have it and it's long enough to be an ID number without country code
    // Example: user enters 812345... but it didn't trigger above (already covered)
    // But if someone enters something else, we let it be and validate length below.
    if (!clean.startsWith('62') && clean.length > 0) {
        clean = '62' + clean; // Forcing 62 per spec
    }

    // 3. Validate length (10 to 15 digits) and starts with 62
    if (!clean.startsWith('62') || clean.length < 10 || clean.length > 15) {
        return ''; // Return empty string for invalid numbers so callers can skip
    }

    return clean;
}


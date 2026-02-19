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

    // 3. Ensure the final format starts with '62'
    if (!clean.startsWith('62')) {
        // If it doesn't start with 62 (and wasn't 08 or 8..), we assume it's missing country code
        // or user input full intl format without + (e.g. 12345).
        // However, to be strict as requested: "Ensure the final format is always a string of numbers starting with '62'."
        // If it's empty, return empty (so validation can catch "required").
        if (clean.length > 0) {
            clean = '62' + clean;
        }
    }

    return clean;
}


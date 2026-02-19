
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { identifier, password } = body; // identifier can be username, email, or phone

        if (!identifier || !password) {
            // 400 Bad Request
            return NextResponse.json(
                { message: 'Missing identifier or password' },
                { status: 400 }
            );
        }

        // Determine if identifier is possibly a phone number
        let searchPhone = identifier;

        // Detection logic: If it contains many digits and doesn't look like an email
        // Or simpler: normalize it anyway and check?
        // User says: "The system must normalize the login input if it's detected as a phone number before performing the findUnique or findFirst query".

        // Heuristic: If it has '@', treat as email.
        // If it has spaces/dashes and digits, and no letters (or very few like +), treat as phone.
        // If it has alpha characters (beyond + maybe?), treat as username.
        // BUT usernames can be anything.

        // Let's check for pure letter-only username vs numeric-heavy phone.
        const hasAt = identifier.includes('@');
        // const hasLetters = /[a-zA-Z]/.test(identifier); // Careful, + is not a letter.

        let normalizedPhoneSearch = null;

        if (!hasAt) {
            // Check if it looks phone-ish (e.g. at least 5 digits, allows +, space, dash, parenthesis)
            // And doesn't have many letters (maybe allowing 'ext'?).
            // Simplest: strip non-digits. If length > 6, try to normalize.
            const digits = identifier.replace(/\D/g, '');
            if (digits.length >= 7) {
                // Looks like a phone number. Normalize it.
                const norm = normalizePhone(identifier);
                // If normalization returns a valid-looking 62... number, use it as phone search candidate.
                if (norm.startsWith('62')) {
                    normalizedPhoneSearch = norm;
                }
            }
        }

        // Build query
        // We check:
        // 1. Email matches identifier (exact)
        // 2. Username matches identifier (exact)
        // 3. Phone matches identifier (exact, maybe they typed +62...)
        // 4. Phone matches normalizedPhoneSearch (if applicable)

        const orConditions: any[] = [
            { email: identifier },
            { username: identifier }
        ];

        if (normalizedPhoneSearch) {
            orConditions.push({ phone: normalizedPhoneSearch });
        } else {
            // Just in case they typed exact DB phone but missed normalization heuristic?
            // Unlikely if DB is always normalized.
            // But if they typed '0812...' and DB has '62812...', identifier won't match.
            // normalizedPhoneSearch covers this.
        }

        const user = await prisma.user.findFirst({
            where: {
                OR: orConditions
            }
        });

        if (!user) {
            return NextResponse.json(
                { message: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Verify Password
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return NextResponse.json(
                { message: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Generate Token
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Set cookie
        const response = NextResponse.json(
            {
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone
                }
            },
            { status: 200 }
        );

        // Set HTTP-only cookie
        response.cookies.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60, // 1 hour
            path: '/',
            sameSite: 'strict'
        });

        return response;

    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json(
            { message: 'Internal server error', error: error.message },
            { status: 500 }
        );
    }
}

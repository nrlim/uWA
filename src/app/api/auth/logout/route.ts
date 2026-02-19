
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
    try {
        const response = NextResponse.json(
            { message: 'Logout successful' },
            { status: 200 }
        );

        // Delete cookie by setting maxAge to 0 and immediate expiration
        response.cookies.set('token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            expires: new Date(0),
            path: '/',
            sameSite: 'strict'
        });

        return response;
    } catch (error) {
        return NextResponse.json({ message: 'Error logging out' }, { status: 500 });
    }
}

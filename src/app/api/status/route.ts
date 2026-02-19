import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;
        let userId = null;

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                userId = decoded.userId;
            } catch (e) {
                // Invalid token
            }
        }

        const instance = await prisma.instance.findFirst({
            where: { name: 'default-worker' }
        });

        // If generic worker context, assume we just want system status
        // But for dashboard, we want USER-specific status
        let user = null;
        if (userId) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: { credit: true, plan: true, email: true, name: true }
            });
        }

        const activeBroadcast = await prisma.broadcast.findFirst({
            where: { status: { in: ['PENDING', 'RUNNING'] } },
            orderBy: { createdAt: 'desc' }
        });

        // Also get recent completed
        const recentBroadcasts = await prisma.broadcast.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({
            instance,
            activeBroadcast,
            recent: recentBroadcasts,
            user // Return the full user object (or selected fields)
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}

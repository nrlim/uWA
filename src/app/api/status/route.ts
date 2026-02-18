import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instance = await prisma.instance.findFirst({
            where: { name: 'default-worker' }
        });

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
            recent: recentBroadcasts
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}

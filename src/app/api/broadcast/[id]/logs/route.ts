import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: broadcastId } = await params;

        // Verify the broadcast belongs to the user
        const broadcast = await prisma.broadcast.findFirst({
            where: {
                id: broadcastId,
                userId: userId
            }
        });

        if (!broadcast) {
            return NextResponse.json({ error: 'Broadcast not found or access denied' }, { status: 404 });
        }

        const logs = await prisma.broadcastLog.findMany({
            where: {
                broadcastId: broadcastId
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({ logs });
    } catch (error) {
        console.error('[LOGS API] Error fetching logs:', error);
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}

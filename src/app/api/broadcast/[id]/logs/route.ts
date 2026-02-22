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

        // Parse pagination params from URL
        const url = new URL(request.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
        const actionFilter = url.searchParams.get('action') || ''; // Optional action type filter

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

        // Build where clause with optional action filter
        const whereClause: any = { broadcastId };
        if (actionFilter) {
            whereClause.action = actionFilter;
        }

        // Get total count for pagination
        const totalCount = await prisma.broadcastLog.count({ where: whereClause });
        const totalPages = Math.ceil(totalCount / limit);

        // Fetch paginated logs
        const logs = await prisma.broadcastLog.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return NextResponse.json({
            logs,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            }
        });
    } catch (error) {
        console.error('[LOGS API] Error fetching logs:', error);
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}

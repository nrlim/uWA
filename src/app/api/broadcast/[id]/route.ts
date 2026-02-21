import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export async function DELETE(
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

        // Delete associated messages and logs first (though Prisma usually handles this if cascading is set, 
        // but let's be explicit if we are not sure about schema relations)
        // In this schema, they are just @relation, so we should delete them.

        await prisma.$transaction([
            prisma.message.deleteMany({ where: { broadcastId } }),
            prisma.broadcastLog.deleteMany({ where: { broadcastId } }),
            prisma.broadcast.delete({ where: { id: broadcastId } })
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[BROADCAST DELETE API] Error:', error);
        return NextResponse.json({ error: 'Failed to delete broadcast' }, { status: 500 });
    }
}

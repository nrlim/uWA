import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export async function POST(req: Request) {
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

        const body = await req.json();
        const { instanceId } = body;

        if (!instanceId) {
            return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });
        }

        // Ensure user actually owns this instance
        const userInstance = await prisma.instance.findFirst({
            where: {
                id: instanceId,
                users: { some: { id: userId } }
            }
        });

        if (!userInstance) {
            return NextResponse.json({ error: 'Instance not found or unauthorized' }, { status: 404 });
        }

        // Only allow initialize if disconnected or errored
        if (['CONNECTED', 'INITIALIZING'].includes(userInstance.status)) {
            return NextResponse.json({ error: `Cannot initialize from status ${userInstance.status}` }, { status: 400 });
        }

        // Update status to INITIALIZING and clear any old QR
        const updatedInstance = await prisma.instance.update({
            where: { id: instanceId },
            data: {
                status: 'INITIALIZING',
                qrCode: '' // Clear old QR so frontend shows exactly loading spinner
            }
        });

        return NextResponse.json({ success: true, instance: updatedInstance });
    } catch (error) {
        console.error('[CONNECT API] Error:', error);
        return NextResponse.json({ error: 'Failed to process connection request' }, { status: 500 });
    }
}

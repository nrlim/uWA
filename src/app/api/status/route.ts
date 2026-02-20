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

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ─── Find or Auto-Provision Instance for this User ────────────
        let instance = await prisma.instance.findFirst({
            where: { users: { some: { id: userId } } }
        });

        // If no instance exists for this user, create one automatically.
        // This ensures every user gets their own isolated WhatsApp session.
        if (!instance) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, phone: true, name: true, username: true }
            });

            if (user) {
                try {
                    // Try to create a new instance with the user's phone number
                    instance = await prisma.instance.create({
                        data: {
                            phoneNumber: user.phone,
                            name: `WA ${user.name || user.username}`,
                            status: 'DISCONNECTED',
                            users: { connect: { id: user.id } }
                        }
                    });
                    console.log(`[STATUS API] Auto-provisioned Instance ${instance.id} for User ${user.username} (${user.phone})`);
                } catch (createError: any) {
                    // If phone number already exists (unique constraint), link user to existing instance
                    if (createError.code === 'P2002') {
                        const existingInstance = await prisma.instance.findUnique({
                            where: { phoneNumber: user.phone }
                        });
                        if (existingInstance) {
                            instance = await prisma.instance.update({
                                where: { id: existingInstance.id },
                                data: { users: { connect: { id: user.id } } }
                            });
                            console.log(`[STATUS API] Linked User ${user.username} to existing Instance ${instance.id}`);
                        }
                    } else {
                        console.error('[STATUS API] Failed to auto-provision instance:', createError);
                    }
                }
            }
        }

        // ─── Fetch User Details ──────────────────────────────────────
        let user = null;
        if (userId) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: { credit: true, plan: true, email: true, name: true }
            });
        }

        const activeBroadcast = await prisma.broadcast.findFirst({
            where: { status: { in: ['PENDING', 'RUNNING'] }, userId },
            orderBy: { createdAt: 'desc' }
        });

        // Also get recent completed
        const recentBroadcasts = await prisma.broadcast.findMany({
            where: { userId },
            take: 20,
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({
            instance,
            activeBroadcast,
            recent: recentBroadcasts,
            user
        });
    } catch (error) {
        console.error('[STATUS API] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}

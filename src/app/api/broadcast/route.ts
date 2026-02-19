import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export async function POST(req: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let userId: string;
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
            userId = decoded.userId;
        } catch (e) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const {
            name,
            message,
            recipients,
            delayMin,
            delayMax,
            dailyLimit,
            workingHourStart,
            workingHourEnd,
        } = await req.json();

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return NextResponse.json({ error: 'Invalid recipients' }, { status: 400 });
        }

        const broadcast = await prisma.broadcast.create({
            data: {
                name,
                message,
                status: 'PENDING',
                total: recipients.length,
                delayMin: delayMin || 20,
                delayMax: delayMax || 60,
                dailyLimit: dailyLimit || 0,
                workingHourStart: workingHourStart ?? 5,
                workingHourEnd: workingHourEnd ?? 23,
                user: { connect: { id: userId } }, // Link to the user
                messages: {
                    create: recipients.map((r: string) => ({
                        recipient: r,
                        status: 'PENDING'
                    }))
                }
            }
        });

        return NextResponse.json(broadcast);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 });
    }
}


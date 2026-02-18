import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
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


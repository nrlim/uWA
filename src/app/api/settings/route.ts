import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const userId = decoded.userId;

        let settings = await prisma.settings.findUnique({
            where: { userId }
        });

        if (!settings) {
            settings = await prisma.settings.create({
                data: {
                    userId,
                    isTurboMode: false,
                    workingHourStart: 5,
                    workingHourEnd: 23
                }
            });
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const userId = decoded.userId;

        const body = await req.json();
        const { isTurboMode, workingHourStart, workingHourEnd } = body;

        const settings = await prisma.settings.upsert({
            where: { userId },
            update: {
                isTurboMode: isTurboMode ?? false,
                workingHourStart: workingHourStart ?? 5,
                workingHourEnd: workingHourEnd ?? 23
            },
            create: {
                userId,
                isTurboMode: isTurboMode ?? false,
                workingHourStart: workingHourStart ?? 5,
                workingHourEnd: workingHourEnd ?? 23
            }
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}

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
            isTurboMode,
            imageUrl, // Get from request
        } = await req.json();

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return NextResponse.json({ error: 'Invalid recipients' }, { status: 400 });
        }

        const instance = await prisma.instance.findFirst({
            where: { users: { some: { id: userId } } }
        });

        if (!instance) {
            return NextResponse.json({ error: 'Tidak ada koneksi WhatsApp yang tersedia. Harap hubungkan perangkat Anda terlebih dahulu.' }, { status: 400 });
        }

        // Zero-Waste Broadcasting Enforcement: ensure all recipients are VERIFIED contacts belonging to this user
        const validContacts = await prisma.contact.findMany({
            where: {
                userId,
                phone: { in: recipients },
                status: 'VERIFIED'
            },
            select: { phone: true }
        });

        const verifiedPhones = new Set(validContacts.map((c: any) => c.phone));
        const filteredRecipients = recipients.filter((r: string) => verifiedPhones.has(r));

        if (filteredRecipients.length === 0) {
            return NextResponse.json({ error: 'Tidak ada kontak VERIFIED yang valid dalam daftar penerima.' }, { status: 400 });
        }

        const broadcast = await prisma.broadcast.create({
            data: {
                name,
                message,
                imageUrl, // Save into DB
                status: 'PENDING',
                total: recipients.length,
                delayMin: delayMin || 20,
                delayMax: delayMax || 60,
                dailyLimit: dailyLimit || 0,
                workingHourStart: workingHourStart ?? 5,
                workingHourEnd: workingHourEnd ?? 23,
                isTurboMode: isTurboMode ?? false,
                user: { connect: { id: userId } }, // Link to the user
                instance: { connect: { id: instance.id } }, // Link to the instance
                messages: {
                    create: filteredRecipients.map((r: string) => ({
                        recipient: r,
                        status: 'PENDING',
                        imageUrl, // Store in message for redundancy if needed
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


import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Akses Ditolak: Membutuhkan otentikasi' }, { status: 401 });
        }

        let userId: string;
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
            userId = decoded.userId;
        } catch (e) {
            return NextResponse.json({ error: 'Akses Ditolak: Token tidak valid' }, { status: 401 });
        }

        // Update instance status to signal the worker to disconnect
        const instance = await prisma.instance.findFirst({
            where: { userId }
        });

        if (!instance) {
            return NextResponse.json(
                { error: 'Instance tidak ditemukan' },
                { status: 404 }
            );
        }

        if (instance.status !== 'CONNECTED') {
            return NextResponse.json(
                { error: 'Instance tidak dalam status terhubung' },
                { status: 400 }
            );
        }

        // Set status to DISCONNECTING — the worker will pick this up and logout
        await prisma.instance.update({
            where: { id: instance.id },
            data: { status: 'DISCONNECTING' },
        });

        return NextResponse.json({ success: true, message: 'Perintah disconnect telah dikirim.' });
    } catch (error) {
        console.error('Disconnect error:', error);
        return NextResponse.json(
            { error: 'Gagal memutuskan koneksi' },
            { status: 500 }
        );
    }
}

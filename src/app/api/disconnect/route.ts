import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        // Update instance status to signal the worker to disconnect
        const instance = await prisma.instance.findFirst({
            where: { name: 'default-worker' }
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
            where: { name: 'default-worker' },
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

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod';

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        return decoded.userId;
    } catch (error) {
        return null;
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = await getUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Akses Ditolak: Membutuhkan otentikasi' }, { status: 401 });
        }

        const { id } = await params;
        const { title, content } = await req.json();

        // IDOR protection
        const existing = await prisma.template.findUnique({ where: { id } });
        if (!existing || existing.userId !== userId) {
            return NextResponse.json({ error: 'Akses Ditolak: Anda tidak memiliki izin untuk mengakses data ini.' }, { status: 403 });
        }

        const updated = await prisma.template.update({
            where: { id },
            data: { title, content }
        });
        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = await getUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Akses Ditolak: Membutuhkan otentikasi' }, { status: 401 });
        }

        const { id } = await params;

        // IDOR protection
        const existing = await prisma.template.findUnique({ where: { id } });
        if (!existing || existing.userId !== userId) {
            return NextResponse.json({ error: 'Akses Ditolak: Anda tidak memiliki izin untuk mengakses data ini.' }, { status: 403 });
        }

        await prisma.template.delete({
            where: { id },
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }
}

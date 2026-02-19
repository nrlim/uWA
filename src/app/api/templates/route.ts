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

export async function GET(req: Request) {
    try {
        const userId = await getUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const templates = await prisma.template.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(templates);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { title, content } = await req.json();

        if (!title || !content) {
            return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
        }

        // check template limit
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const count = await prisma.template.count({ where: { userId } });

        if (user && user.templateLimit <= count && user.templateLimit !== 99999) {
            return NextResponse.json({ error: 'Template limit reached. Upgrade your plan.' }, { status: 403 });
        }

        const template = await prisma.template.create({
            data: {
                title,
                content,
                userId
            }
        });

        return NextResponse.json(template);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}

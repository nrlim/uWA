import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
    try {
        const templates = await prisma.template.findMany({
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
        const { title, content, userId } = await req.json();

        if (!title || !content) {
            return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
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

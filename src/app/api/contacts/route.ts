import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key-change-in-prod";

async function getUser() {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        return decoded;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: any = { userId: user.userId };

    if (status && status !== "ALL") {
        where.status = status;
    }

    if (search) {
        where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { tags: { contains: search, mode: "insensitive" } }
        ];
    }

    try {
        const contacts = await prisma.contact.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 1000, // Limit to 1000 for standard view, can implement pagination later
        });
        return NextResponse.json(contacts);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();

        // Single add or bulk add?
        if (body.contacts && Array.isArray(body.contacts)) {
            const rawContacts = body.contacts;

            // Normalize and deduplicate based on phone
            const validContacts = [];
            const seenPhones = new Set();

            // Get user's existing phones to prevent unique constraint errors during bulk insert
            const existingContacts = await prisma.contact.findMany({
                where: { userId: user.userId },
                select: { phone: true }
            });
            const existingPhones = new Set(existingContacts.map((c: any) => c.phone));

            for (const c of rawContacts) {
                if (!c.phone) continue;
                const normalized = normalizePhone(String(c.phone));
                if (!normalized) continue;

                if (!seenPhones.has(normalized) && !existingPhones.has(normalized)) {
                    seenPhones.add(normalized);
                    validContacts.push({
                        userId: user.userId,
                        phone: normalized,
                        name: c.name || null,
                        tags: c.tags || null,
                        status: "PENDING"
                    });
                }
            }

            if (validContacts.length === 0) {
                return NextResponse.json({ imported: 0, skipped: rawContacts.length, message: "No new valid contacts found." });
            }

            const result = await prisma.contact.createMany({
                data: validContacts,
                skipDuplicates: true, // extra safety layer
            });

            return NextResponse.json({
                imported: result.count,
                skipped: rawContacts.length - result.count
            });

        } else {
            // Single contact
            const { name, phone, tags } = body;
            const normalized = normalizePhone(phone);
            if (!normalized) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });

            // check exists
            const existing = await prisma.contact.findUnique({
                where: { userId_phone: { userId: user.userId, phone: normalized } }
            });

            if (existing) {
                return NextResponse.json({ error: "Contact already exists" }, { status: 400 });
            }

            const contact = await prisma.contact.create({
                data: {
                    userId: user.userId,
                    name,
                    phone: normalized,
                    tags,
                    status: "PENDING"
                }
            });
            return NextResponse.json(contact);
        }

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { ids } = body;

        if (!ids || !Array.isArray(ids)) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const result = await prisma.contact.deleteMany({
            where: {
                userId: user.userId,
                id: { in: ids }
            }
        });

        return NextResponse.json({ deleted: result.count });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { id, name, phone, tags } = body;

        if (!id) return NextResponse.json({ error: "Contact ID is required" }, { status: 400 });

        const contact = await prisma.contact.findUnique({ where: { id } });
        if (!contact || contact.userId !== user.userId) {
            return NextResponse.json({ error: "Contact not found" }, { status: 404 });
        }

        let normalizedPhone = phone;
        if (phone) {
            normalizedPhone = normalizePhone(phone);
            if (!normalizedPhone) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });

            const existing = await prisma.contact.findFirst({
                where: { userId: user.userId, phone: normalizedPhone, id: { not: id } }
            });

            if (existing) {
                return NextResponse.json({ error: "Another contact already uses this phone number" }, { status: 400 });
            }
        }

        const dataToUpdate: any = {};
        if (name !== undefined) dataToUpdate.name = name;
        if (normalizedPhone !== undefined) dataToUpdate.phone = normalizedPhone;
        if (tags !== undefined) dataToUpdate.tags = tags;

        const updatedContact = await prisma.contact.update({
            where: { id },
            data: dataToUpdate
        });

        return NextResponse.json(updatedContact);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

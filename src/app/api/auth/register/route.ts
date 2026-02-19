
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Using alias
import { normalizePhone } from '@/lib/utils';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { username, email, phone, password } = body;

        if (!username || !email || !phone || !password) {
            return NextResponse.json(
                { message: 'Missing required fields (username, email, phone, password)' },
                { status: 400 }
            );
        }

        // 1. Normalize Phone (MANDATORY step before DB checks)
        const finalPhone = normalizePhone(phone);
        console.log('Normalized phone:', phone, '->', finalPhone);

        // 2. Dual Validation (Check if User Exists by Email OR Final Phone)
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email },
                    { phone: finalPhone },
                    { username: username }
                ]
            }
        });

        if (existingUser) {
            // Step 3: Trigger "Data Already Exists" error
            // Identify what matched
            let matchType = 'UNKNOWN';
            if (existingUser.email === email) matchType = 'EMAIL';
            if (existingUser.phone === finalPhone) matchType = 'PHONE';
            if (existingUser.username === username) matchType = 'USERNAME';

            console.log(`User already exists. Match: ${matchType}. Conflict: ${existingUser.username}`);

            return NextResponse.json(
                {
                    message: 'User already exists with this email or phone number.',
                    detail: `Conflict found: ${matchType}`,
                    field: matchType.toLowerCase()
                },
                { status: 409 } // Conflict
            );
        }

        // 3. Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Determine Limits based on Plan
        // 4. Determine Limits based on Plan
        // Default to TRIAL unless explicitly specified (though usually registration implies free/trial first)
        const planNameRaw = body.plan ? body.plan.toUpperCase() : 'TRIAL';
        let plan = planNameRaw;

        // Ensure valid plans
        if (!['TRIAL', 'STARTER', 'PRO', 'ELITE'].includes(plan)) {
            plan = 'TRIAL';
        }

        let credit = 1000;      // Default STARTER credit
        let accountLimit = 1;
        let templateLimit = 20;

        if (plan === 'TRIAL') {
            credit = 100;
            accountLimit = 1;
            templateLimit = 5;
        } else if (plan === 'STARTER') {
            credit = 1500;
            accountLimit = 1;
            templateLimit = 20;
        } else if (plan === 'PRO') {
            credit = 7500;
            accountLimit = 3;
            templateLimit = 100;
        } else if (plan === 'ELITE') {
            credit = 9999999; // Unlimited
            accountLimit = 5;
            templateLimit = 99999;
        }

        // 5. Create User
        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                phone: finalPhone,
                password: hashedPassword,
                name: username, // Default name to username
                role: 'USER',
                plan: plan,
                credit: credit,
                accountLimit: accountLimit,
                templateLimit: templateLimit
            }
        });
        console.log(`User created: ${newUser.username} | Role: ${newUser.role} | Plan: ${plan} | Limit: ${credit}`);

        return NextResponse.json(
            {
                message: 'User registered successfully',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    phone: newUser.phone
                }
            },
            { status: 201 }
        );

    } catch (error: any) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { message: 'Internal server error', error: error.message },
            { status: 500 }
        );
    }
}

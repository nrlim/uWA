import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import midtransClient from 'midtrans-client'

export async function POST(req: Request) {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('token')?.value
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod') as any
        const userId = decoded.userId

        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

        const { plan } = await req.json()

        if (!['STARTER', 'PRO', 'ELITE'].includes(plan)) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
        }

        // Define gross amount exactly as requested
        let grossAmount = 0
        if (plan === 'STARTER') grossAmount = 99000
        else if (plan === 'PRO') grossAmount = 149000
        else if (plan === 'ELITE') grossAmount = 499000 // STRICT PRICE INTEGRITY

        // Create transaction record
        const orderId = `ORDER-${Date.now()}-${userId.substring(0, 5)}`

        await prisma.transaction.create({
            data: {
                userId,
                orderId,
                grossAmount,
                plan: plan as any,
                status: 'pending'
            }
        })

        // Initialize Midtrans Snap
        const snap = new midtransClient.Snap({
            isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
            serverKey: process.env.MIDTRANS_SERVER_KEY as string,
            clientKey: process.env.MIDTRANS_CLIENT_KEY as string,
        })

        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: grossAmount
            },
            customer_details: {
                first_name: user.name || user.username,
                email: user.email,
                phone: user.phone || ''
            }
        }

        const transaction = await snap.createTransaction(parameter)

        console.log(`[Midtrans Checkout] Attempted by ${user.username}, Order: ${orderId}, Amount: ${grossAmount}`)

        return NextResponse.json({ token: transaction.token, redirect_url: transaction.redirect_url })
    } catch (error) {
        console.error('Checkout error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

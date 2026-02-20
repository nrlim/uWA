import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import crypto from 'crypto'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const {
            order_id,
            transaction_status,
            fraud_status,
            signature_key,
            status_code,
            gross_amount,
            transaction_id,
            payment_type
        } = body

        const serverKey = process.env.MIDTRANS_SERVER_KEY as string

        const hash = crypto.createHash('sha512').update(`${order_id}${status_code}${gross_amount}${serverKey}`).digest('hex')

        if (hash !== signature_key) {
            console.error('[Midtrans Webhook] Invalid signature key for Order:', order_id)
            return NextResponse.json({ error: 'Invalid signature key' }, { status: 400 })
        }

        const transaction = await prisma.transaction.findUnique({
            where: { orderId: order_id }
        })

        if (!transaction) {
            console.error('[Midtrans Webhook] Transaction not found:', order_id)
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }

        console.log(`[Midtrans Webhook] Received status ${transaction_status} for Order: ${order_id}`)

        let newStatus = transaction.status
        let activateFeatures = false
        let revertFeatures = false

        if (transaction_status === 'capture') {
            if (fraud_status === 'accept') {
                newStatus = 'settlement'
                activateFeatures = true
            }
        } else if (transaction_status === 'settlement') {
            newStatus = 'settlement'
            activateFeatures = true
        } else if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
            newStatus = transaction_status
            revertFeatures = true
        } else if (transaction_status === 'pending') {
            newStatus = 'pending'
        }

        // Only update if not already settled previously
        if (transaction.status === 'settlement' && activateFeatures) {
            return NextResponse.json({ success: true, message: 'Already activated' })
        }

        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                status: newStatus,
                transactionId: transaction_id,
                paymentType: payment_type
            }
        })

        if (activateFeatures) {
            // Unlock features automatically
            const plan = transaction.plan
            let accountLimit = 1
            let credit = 100
            let templateLimit = 5
            let isTurboMode = false

            if (plan === 'STARTER') {
                accountLimit = 1
                credit = 1500
                templateLimit = 20
            } else if (plan === 'PRO') {
                accountLimit = 3
                credit = 7500
                templateLimit = 100
                isTurboMode = true
            } else if (plan === 'ELITE') {
                accountLimit = 5
                credit = 9999999 // Unlimited
                templateLimit = 9999999
                isTurboMode = true
            }

            // Sync User Plan
            await prisma.user.update({
                where: { id: transaction.userId },
                data: {
                    plan,
                    credit,
                    accountLimit,
                    templateLimit
                }
            })

            // Sync Settings (TurboMode)
            const existingSettings = await prisma.settings.findUnique({ where: { userId: transaction.userId } })
            if (existingSettings) {
                await prisma.settings.update({
                    where: { userId: transaction.userId },
                    data: { isTurboMode }
                })
            } else {
                await prisma.settings.create({
                    data: {
                        userId: transaction.userId,
                        isTurboMode
                    }
                })
            }

            console.log(`[Webhook Action] User ${transaction.userId} activated ${plan}`)
        }

        if (revertFeatures && transaction.status === 'settlement') {
            console.log(`[Webhook Action] User ${transaction.userId} plan expired/canceled, manual revert required.`)
            // You could optionally auto downgrade here, but it's safer to alert admins for manual sync.
        }

        return NextResponse.json({ success: true, status: newStatus })
    } catch (error) {
        console.error('Midtrans webhook error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

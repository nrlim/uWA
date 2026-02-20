import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { StatusProvider } from "@/contexts/StatusContext"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"
import prisma from "@/lib/prisma"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    let userProfile = null

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-prod') as any
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { username: true, name: true, plan: true }
            })
            if (user) {
                userProfile = {
                    username: user.username,
                    name: user.name,
                    plan: user.plan
                }
            }
        } catch (error) {
            console.error('Failed to verify token in layout', error)
        }
    }

    return (
        <StatusProvider>
            <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
                <Sidebar userProfile={userProfile} />
                <div className="md:ml-64 flex flex-col min-h-screen transition-all duration-300">
                    <Header />
                    <main className="flex-1 p-6 md:p-8 animate-in fade-in duration-500">
                        {children}
                    </main>
                </div>
            </div>
        </StatusProvider>
    )
}

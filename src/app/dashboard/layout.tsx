import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { StatusProvider } from "@/contexts/StatusContext"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <StatusProvider>
            <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
                <Sidebar />
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

"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
export type InstanceStatus = "DISCONNECTED" | "INITIALIZING" | "QR_READY" | "CONNECTED" | "DISCONNECTING" | "restoring"

interface Instance {
    id: string
    name: string
    status: InstanceStatus
    qrCode?: string
    updatedAt: string
}

interface Broadcast {
    id: string
    name: string
    status: string
    total: number
    sent: number
    failed: number
    createdAt: string
}

interface User {
    id: string
    name: string | null
    email: string
    plan: string
    credit: number
}

interface StatusContextType {
    instance: Instance | null
    activeBroadcast: Broadcast | null
    recentBroadcasts: Broadcast[]
    user: User | null
    isLoading: boolean
    refresh: () => void
}

const StatusContext = createContext<StatusContextType | undefined>(undefined)

export function StatusProvider({ children }: { children: React.ReactNode }) {
    const [instance, setInstance] = useState<Instance | null>(null)
    const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null)
    const [recentBroadcasts, setRecentBroadcasts] = useState<Broadcast[]>([])
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const fetchStatus = async () => {
        try {
            const res = await fetch("/api/status")
            const data = await res.json()
            if (data) {
                setInstance(data.instance)
                setActiveBroadcast(data.activeBroadcast)
                setRecentBroadcasts(data.recent || [])
                setUser(data.user || null)
            }
        } catch (error) {
            console.error("Failed to fetch status:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000) // Poll every 5 seconds (slower is fine)
        return () => clearInterval(interval)
    }, [])

    return (
        <StatusContext.Provider value={{ instance, activeBroadcast, recentBroadcasts, user, isLoading, refresh: fetchStatus }}>
            {children}
        </StatusContext.Provider>
    )
}

export function useStatus() {
    const context = useContext(StatusContext)
    if (context === undefined) {
        throw new Error("useStatus must be used within a StatusProvider")
    }
    return context
}

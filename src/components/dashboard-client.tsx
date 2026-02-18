"use client"

import * as React from "react"
import { QRCodeSVG } from "qrcode.react"
import { Upload, Smartphone, Send, CheckCircle, Activity, Play, List } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

// Simple Polling Hook
function usePolling(url: string, interval = 1000) {
    const [data, setData] = React.useState<any>(null)
    const [error, setError] = React.useState(null)

    React.useEffect(() => {
        const fetcher = () => fetch(url).then((res) => res.json()).then(setData).catch(setError)
        fetcher()
        const id = setInterval(fetcher, interval)
        return () => clearInterval(id)
    }, [url, interval])

    return { data, error }
}

export function DashboardClient() {
    const { data } = usePolling('/api/status', 2000)
    const [file, setFile] = React.useState<File | null>(null)
    const [parsedContacts, setParsedContacts] = React.useState<string[]>([])
    const [message, setMessage] = React.useState("")
    const [broadcastName, setBroadcastName] = React.useState("Campaign " + new Date().toLocaleDateString())
    const [isUploading, setIsUploading] = React.useState(false)

    const instance = data?.instance
    const activeBroadcast = data?.activeBroadcast
    const isConnected = instance?.status === 'CONNECTED'
    const isQRReady = instance?.status === 'QR_READY'

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0]
            setFile(f)
            const text = await f.text()
            // Extract numbers (naive regex)
            const numbers = text.match(/\d+/g) || []
            const unique = Array.from(new Set(numbers)).filter(n => n.length >= 10) // Basic filter
            setParsedContacts(unique)
        }
    }

    const handleLaunch = async () => {
        if (!parsedContacts.length || !message) return
        setIsUploading(true)
        try {
            await fetch('/api/broadcast', {
                method: 'POST',
                body: JSON.stringify({
                    name: broadcastName,
                    message,
                    recipients: parsedContacts
                })
            })
            setParsedContacts([])
            setMessage("")
            setFile(null)
        } catch (e) {
            console.error(e)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* CONNECTION STATUS */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5" />
                        Active Connection
                    </CardTitle>
                    <CardDescription>
                        Engine Status Interface
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center min-h-[200px]">
                    {isConnected ? (
                        <div className="text-center space-y-4">
                            <div className="bg-green-100 p-4 rounded-full inline-block">
                                <CheckCircle className="h-12 w-12 text-green-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">Engine Online</h3>
                                <p className="text-sm text-muted-foreground">{instance?.name}</p>
                            </div>
                        </div>
                    ) : isQRReady && instance?.qrCode ? (
                        <div className="flex flex-col items-center space-y-4">
                            <div className="p-4 bg-white border rounded-lg">
                                <QRCodeSVG value={instance.qrCode} size={150} />
                            </div>
                            <p className="text-sm font-medium">Scan with WhatsApp</p>
                        </div>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="animate-pulse bg-muted rounded-full h-12 w-12 mx-auto" />
                            <p className="text-sm text-muted-foreground">{instance?.status || 'Connecting...'}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* BROADCAST FORM */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5" />
                        New Broadcast
                    </CardTitle>
                    <CardDescription>
                        Configure your campaign strictly. No automated filler.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="b-name">Campaign Reference</Label>
                        <Input
                            id="b-name"
                            value={broadcastName}
                            onChange={(e) => setBroadcastName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="upload">Recipient List (TXT/CSV)</Label>
                            <div className="border rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 relative">
                                <Input
                                    type="file"
                                    id="upload"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileUpload}
                                    accept=".txt,.csv"
                                />
                                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {file ? file.name : "Click to Upload List"}
                                </span>
                            </div>
                            {parsedContacts.length > 0 && (
                                <p className="text-xs font-medium text-green-600">
                                    {parsedContacts.length} valid contacts extracted
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="message">Message Content (Spintax Supported)</Label>
                            <Textarea
                                id="message"
                                placeholder="Hello {Name|Friend}, check out..."
                                className="min-h-[100px]"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-end border-t pt-4">
                    <Button
                        onClick={handleLaunch}
                        disabled={!parsedContacts.length || !message || isUploading || !!activeBroadcast}
                    >
                        {isUploading ? "Initializing..." : "Launch Campaign"}
                        <Play className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>

            {/* ACTIVE QUEUE */}
            <Card className="lg:col-span-3">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Queue Overview
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {activeBroadcast ? (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="font-semibold text-lg">{activeBroadcast.name}</h3>
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full uppercase tracking-wider font-bold">
                                        {activeBroadcast.status}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold">{((activeBroadcast.sent / activeBroadcast.total) * 100).toFixed(1)}%</p>
                                    <p className="text-xs text-muted-foreground">Progress Completion</p>
                                </div>
                            </div>

                            <Progress value={(activeBroadcast.sent / activeBroadcast.total) * 100} className="h-3" />

                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="border rounded p-2">
                                    <p className="text-sm text-muted-foreground">Total</p>
                                    <p className="font-bold">{activeBroadcast.total}</p>
                                </div>
                                <div className="border rounded p-2 bg-green-50/50">
                                    <p className="text-sm text-green-600">Successful</p>
                                    <p className="font-bold">{activeBroadcast.sent}</p>
                                </div>
                                <div className="border rounded p-2 bg-red-50/50">
                                    <p className="text-sm text-red-600">Failed</p>
                                    <p className="font-bold">{activeBroadcast.failed}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <List className="h-12 w-12 mx-auto mb-2 opacity-20" />
                            <p>No active campaigns in queue.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { User, Shield, Key, Bell, Save } from "lucide-react"

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-100">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
                    <p className="text-slate-500 mt-2 text-lg">Manage your account and engine configurations.</p>
                </div>
                <Button className="bg-slate-900 text-white hover:bg-slate-800 h-11 px-6 rounded-xl gap-2 font-medium shadow-lg shadow-slate-900/10">
                    <Save className="h-4 w-4" /> Save Changes
                </Button>
            </div>

            <div className="grid gap-6">
                {/* Profile Section */}
                <Card className="border-0 shadow-sm border-slate-200 bg-white rounded-3xl overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 p-6 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Account Profile</h2>
                            <p className="text-sm text-slate-500">Update your personal information.</p>
                        </div>
                    </div>
                    <CardContent className="p-8 space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="font-semibold text-slate-700">Display Name</Label>
                                <Input defaultValue="Admin User" className="h-12 rounded-xl" />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-semibold text-slate-700">Email Address</Label>
                                <Input defaultValue="admin@uwa.engine" className="h-12 rounded-xl bg-slate-50" disabled />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Safety Section */}
                <Card className="border-0 shadow-sm border-slate-200 bg-white rounded-3xl overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 p-6 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Global Safety</h2>
                            <p className="text-sm text-slate-500">Default protection settings for new campaigns.</p>
                        </div>
                    </div>
                    <CardContent className="p-8 space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="font-semibold text-slate-700">Default Min Delay (s)</Label>
                                <Input type="number" defaultValue="20" className="h-12 rounded-xl" />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-semibold text-slate-700">Default Max Delay (s)</Label>
                                <Input type="number" defaultValue="60" className="h-12 rounded-xl" />
                            </div>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 font-medium">
                            Safety Note: Increasing these delays significantly reduces the risk of number banning.
                        </div>
                    </CardContent>
                </Card>

                {/* API Section */}
                <Card className="border-0 shadow-sm border-slate-200 bg-white rounded-3xl overflow-hidden opacity-60">
                    <div className="border-b border-slate-100 bg-slate-50/50 p-6 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                            <Key className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                API Access
                                <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Coming Soon</span>
                            </h2>
                            <p className="text-sm text-slate-500">Manage programmable access keys.</p>
                        </div>
                    </div>
                    <CardContent className="p-8">
                        <div className="flex gap-4">
                            <Input value="API_KEY_PLACEHOLDER" className="h-12 rounded-xl font-mono bg-slate-50 text-slate-400" disabled />
                            <Button variant="outline" className="h-12 rounded-xl px-6" disabled>Regenerate</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

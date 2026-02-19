
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { normalizePhone } from '@/lib/utils';
import { cn } from '@/lib/utils'; // Assuming you have a cn utility

export default function LoginPage() {
    const router = useRouter();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Visual feedback state
    const [isIdValid, setIsIdValid] = useState(false);

    const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setIdentifier(val);
        // Basic validation: Email regex OR Phone length > 9 OR Username > 3
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        const isPhone = val.replace(/\D/g, '').length >= 10;
        const isUser = val.length > 3 && !val.includes('@');

        setIsIdValid(isEmail || isPhone || isUser);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ identifier, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || 'Login gagal. Periksa kembali data Anda.');
            } else {
                // Success
                router.push('/dashboard');
                router.refresh();
            }
        } catch (err) {
            console.error(err);
            setError('Terjadi kesalahan sistem.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-white font-sans text-slate-900">
            {/* Split Screen - Left Side (Brand/Value) */}
            <div className="hidden lg:flex flex-col w-1/2 bg-slate-50 border-r border-slate-100 p-12 lg:p-16 justify-between relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-100/40 via-transparent to-transparent opacity-70 pointer-events-none"></div>

                {/* Logo */}
                <div className="z-10 flex items-center gap-3">
                    <div className="h-10 w-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                        u
                    </div>
                    <span className="font-bold text-2xl tracking-tight text-slate-900">uWA</span>
                </div>

                <div className="z-10 max-w-md">
                    <h2 className="text-4xl font-bold tracking-tight text-slate-900 leading-tight mb-6">
                        Automasi WhatsApp Profesional untuk Bisnis Anda.
                    </h2>
                    <p className="text-lg text-slate-600 leading-relaxed mb-8">
                        Kelola ribuan pesan, pantau performa kampanye, dan tingkatkan konversi penjualan dengan platform yang aman dan terpercaya.
                    </p>

                    <div className="flex gap-4">
                        <div className="flex -space-x-3">
                            <img src="https://randomuser.me/api/portraits/men/32.jpg" alt="User" className="h-10 w-10 rounded-full border-2 border-slate-50 object-cover" />
                            <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="User" className="h-10 w-10 rounded-full border-2 border-slate-50 object-cover" />
                            <img src="https://randomuser.me/api/portraits/men/86.jpg" alt="User" className="h-10 w-10 rounded-full border-2 border-slate-50 object-cover" />
                            <img src="https://randomuser.me/api/portraits/women/68.jpg" alt="User" className="h-10 w-10 rounded-full border-2 border-slate-50 object-cover" />
                        </div>
                        <div className="flex flex-col justify-center">
                            <span className="text-sm font-bold text-slate-900">2,000+ Bisnis</span>
                            <span className="text-xs text-slate-500">Telah bergabung bersama kami</span>
                        </div>
                    </div>
                </div>

                <div className="z-10 text-xs text-slate-400">
                    &copy; 2026 uWA Technology. Enterprise Grade Security.
                </div>
            </div>

            {/* Split Screen - Right Side (Form) */}
            <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-24 bg-white relative">
                <Link href="/" className="absolute top-8 left-8 lg:hidden flex items-center text-sm text-slate-500 hover:text-slate-900 transition-colors">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Link>

                <div className="w-full max-w-[400px] space-y-8">
                    <div className="text-center lg:text-left">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Selamat Datang Kembali</h1>
                        <p className="mt-2 text-slate-500">
                            Masukkan detail akun Anda untuk melanjutkan.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm font-medium animate-in fade-in slide-in-from-top-1 flex items-start">
                                <span className="mr-2">⚠️</span> {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="identifier" className="text-sm font-semibold text-slate-700">Email, Username, atau WhatsApp</Label>
                            <div className="relative">
                                <Input
                                    id="identifier"
                                    type="text"
                                    placeholder="nama@perusahaan.com"
                                    required
                                    value={identifier}
                                    onChange={handleIdChange}
                                    className={cn(
                                        "h-12 border-slate-200 bg-slate-50/50 focus:bg-white transition-all pl-4 pr-10",
                                        isIdValid && "border-teal-500/50 focus:ring-teal-500/20"
                                    )}
                                />
                                {isIdValid && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-600 animate-in zoom-in spin-in-90 duration-300">
                                        <CheckCircle className="h-5 w-5" />
                                    </div>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium ml-1">
                                Tips: Format 08.. akan otomatis diseragamkan ke 62..
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
                                <Link href="#" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                                    Lupa Password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-12 border-slate-200 bg-slate-50/50 focus:bg-white transition-all pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Verifikasi...
                                </span>
                            ) : 'Masuk Dashboard'}
                        </Button>
                    </form>

                    <div className="text-center text-sm text-slate-500">
                        Belum memiliki akun?{' '}
                        <Link href="/register" className="font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                            Daftar Sekarang
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

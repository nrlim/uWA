
'use client';

import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function RegisterForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const plan = searchParams.get('plan') || 'trial'; // Default to trial if not provided

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        phone: '',
        password: '',
        plan: plan, // Add plan to form data
    });
    const [isLoading, setIsLoading] = useState(false);
    const [errorDialog, setErrorDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Validation Feedback
    const [validFields, setValidFields] = useState({
        username: false,
        email: false,
        phone: false
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });

        // Basic Front-end validation for visuals
        if (name === 'username') setValidFields({ ...validFields, username: value.length > 3 });
        if (name === 'email') setValidFields({ ...validFields, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) });
        if (name === 'phone') setValidFields({ ...validFields, phone: value.length > 9 });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMessage('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (!res.ok) {
                // Handle error
                if (res.status === 409) {
                    // Conflict - User already exists
                    setErrorMessage(data.message || 'Email atau Nomor Anda sudah terdaftar.');
                    setErrorDialog(true);
                } else {
                    // Other errors
                    console.error(data);
                    alert(data.message || 'Registrasi gagal. Silakan coba lagi.');
                }
            } else {
                // Success
                router.push('/login?registered=true');
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Terjadi kesalahan jaringan.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 h-screen flex flex-col justify-center items-center p-4 sm:p-8 bg-white relative">
            <Link href="/" className="absolute top-6 left-6 lg:hidden flex items-center text-sm text-slate-500 hover:text-slate-900 transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Link>

            <div className="w-full max-w-[420px] space-y-5">
                <div className="text-center lg:text-left">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Buat Akun Baru</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Daftar gratis dan nikmati fitur premium selama 14 hari.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="username" className="text-xs font-semibold text-slate-700">Username</Label>
                            <div className="relative">
                                <Input
                                    id="username"
                                    name="username"
                                    type="text"
                                    placeholder="johndoe"
                                    required
                                    value={formData.username}
                                    onChange={handleChange}
                                    className={cn(
                                        "h-9 text-sm border-slate-200 bg-slate-50/50 focus:bg-white transition-all",
                                        validFields.username && "border-teal-500/50 focus:ring-teal-500/20 pr-8"
                                    )}
                                />
                                {validFields.username && <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-600 animate-in zoom-in" />}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">WhatsApp</Label>
                            <div className="relative">
                                <Input
                                    id="phone"
                                    name="phone"
                                    type="tel"
                                    placeholder="0812..."
                                    required
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className={cn(
                                        "h-9 text-sm border-slate-200 bg-slate-50/50 focus:bg-white transition-all",
                                        validFields.phone && "border-teal-500/50 focus:ring-teal-500/20 pr-8"
                                    )}
                                />
                                {validFields.phone && <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-600 animate-in zoom-in" />}
                            </div>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium -mt-1 mb-1">
                        Format 08... otomatis diseragamkan ke 62...
                    </p>

                    <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Email</Label>
                        <div className="relative">
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="nama@perusahaan.com"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                className={cn(
                                    "h-9 text-sm border-slate-200 bg-slate-50/50 focus:bg-white transition-all",
                                    validFields.email && "border-teal-500/50 focus:ring-teal-500/20 pr-8"
                                )}
                            />
                            {validFields.email && <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-600 animate-in zoom-in" />}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-semibold text-slate-700">Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                required
                                value={formData.password}
                                onChange={handleChange}
                                className="h-9 text-sm border-slate-200 bg-slate-50/50 focus:bg-white transition-all pr-8"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    </div>

                    <Button
                        className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 mt-2"
                        type="submit"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mendaftarkan...
                            </span>
                        ) : 'Buat Akun Sekarang'}
                    </Button>
                </form>

                <div className="text-center text-xs text-slate-500 pt-2">
                    Sudah punya akun?{' '}
                    <Link href="/login" className="font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                        Masuk Disini
                    </Link>
                </div>
            </div>

            {/* Already Exists Dialog - Professional Style */}
            <Dialog open={errorDialog} onOpenChange={setErrorDialog}>
                <DialogContent className="sm:max-w-[425px] border-slate-200 bg-white shadow-2xl p-6">
                    <DialogHeader className="mb-4">
                        <div className="mx-auto h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                            <span className="text-2xl">⚠️</span>
                        </div>
                        <DialogTitle className="text-center text-xl font-bold text-slate-900">Data Terdeteksi</DialogTitle>
                        <DialogDescription className="text-center text-slate-600 mt-2">
                            Email atau Nomor WhatsApp ini sudah terdaftar dalam sistem kami.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3">
                        <Link href="/login" className="w-full">
                            <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11">
                                Masuk ke Akun Saya
                            </Button>
                        </Link>
                        <Button variant="outline" onClick={() => setErrorDialog(false)} className="w-full border-slate-200 text-slate-700 h-11 hover:bg-slate-50">
                            Periksa Kembali Data
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <div className="min-h-screen w-full flex bg-white font-sans text-slate-900 overflow-hidden">
            {/* Split Screen - Left Side (Brand/Values) */}
            <div className="hidden lg:flex flex-col w-1/2 h-screen bg-slate-950 p-12 lg:p-16 justify-between relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-teal-900/40 via-transparent to-transparent opacity-80 pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -mr-20 -mt-20"></div>

                <div className="z-10 flex items-center">
                    <div className="flex items-center justify-center -ml-4 -mr-4">
                        <Image src="/images/main-logo-v2.png" alt="uWA Logo" width={96} height={96} className="object-contain drop-shadow-md" />
                    </div>
                </div>

                <div className="z-10 max-w-lg">
                    <h2 className="text-4xl font-bold tracking-tight text-white leading-tight mb-8">
                        Mulai Perjalanan Automasi Anda.
                    </h2>
                    <div className="space-y-6">
                        <div className="flex gap-4">
                            <div className="h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                                <span className="text-teal-400 font-bold">1</span>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Daftar Akun</h3>
                                <p className="text-slate-400 text-sm">Proses cepat tanpa kartu kredit.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                                <span className="text-blue-400 font-bold">2</span>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Scan QR Code</h3>
                                <p className="text-slate-400 text-sm">Hubungkan WhatsApp dalam hitungan detik.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                                <span className="text-purple-400 font-bold">3</span>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Kirim Pesan</h3>
                                <p className="text-slate-400 text-sm">Jangkau pelanggan Anda secara otomatis.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="z-10 text-xs text-slate-600">
                    Terms & Privacy Policy applied.
                </div>
            </div>

            {/* Split Screen - Right Side (Form) with Suspense */}
            <Suspense fallback={
                <div className="flex-1 h-screen flex flex-col justify-center items-center p-8 bg-white">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-900" />
                </div>
            }>
                <RegisterForm />
            </Suspense>
        </div>
    );
}


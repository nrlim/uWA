import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "uWA - Mesin WhatsApp Terbaik",
  description: "Tingkatkan komunikasi WhatsApp Anda dengan mesin 'shared connection pool' terbaik.",
  openGraph: {
    title: "uWA - Mesin WhatsApp Terbaik",
    description: "Tingkatkan komunikasi WhatsApp Anda dengan mesin 'shared connection pool' terbaik.",
    type: "website",
    siteName: "uWA",
    images: [
      {
        url: "/images/new-thumbnail-optimized.jpg",
        width: 1200,
        height: 630,
        alt: "uWA - Mesin WhatsApp Terbaik",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "uWA - Mesin WhatsApp Terbaik",
    description: "Tingkatkan komunikasi WhatsApp Anda dengan mesin 'shared connection pool' terbaik.",
    images: ["/images/new-thumbnail-optimized.jpg"],
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIGNAL — Crypto Trading Intelligence",
  description: "AI-powered crypto trading signals. Real-time analysis, multi-agent intelligence, Gen-Z approved.",
  keywords: ["crypto", "trading", "signals", "AI", "Bitcoin", "Ethereum"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-[#050508] text-[#f0f0ff] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

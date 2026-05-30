import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ClauseCheck AI",
  description: "Find risky clauses in your contracts instantly",
  openGraph: {
    title: "ClauseCheck AI",
    description: "Find risky clauses in your contracts instantly.",
    url: "https://clausecheckai.vercel.app",
    siteName: "ClauseCheck AI",
    images: [
      {
        url: "https://clausecheckai.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "ClauseCheck AI — Contract Risk Analysis",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClauseCheck AI",
    description: "Find risky clauses in your contracts instantly.",
    images: ["https://clausecheckai.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

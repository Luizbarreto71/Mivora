import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

// Official MIVORA typeface (variable font: every weight from 100 to 900)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MIVORA — Skincare coreano e beleza internacional",
    template: "%s | MIVORA",
  },
  description:
    "Boutique digital de skincare com curadoria de marcas internacionais. Monte seu pedido no site e finalize pelo WhatsApp.",
  applicationName: "MIVORA",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "MIVORA",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Virtual Ethnic Fashion Mirror | AI Smart Try-On",
  description:
    "Experience traditional ethnic fashion with our AI-powered smart mirror. Try on traditional Mường outfits in realtime using advanced pose detection technology.",
  keywords: [
    "virtual try-on",
    "smart mirror",
    "ethnic fashion",
    "Mường clothing",
    "AI pose detection",
    "MediaPipe",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body
        className={`${inter.variable} ${orbitron.variable} font-sans bg-black text-white antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { satoshi } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "FormaWorld",
  description: "A spatial interface for Autodesk Forma projects",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={satoshi.variable}>
      <body>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="FormaWorld home">
            <BrandMark />
            <span>FormaWorld</span>
          </Link>
          <span className="phase-badge">MVP · World Alpha</span>
        </header>
        {children}
      </body>
    </html>
  );
}

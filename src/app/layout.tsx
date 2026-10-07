import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DAILY AI",
  description: "Continuous AI engineering learning, experimentation & knowledge platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
          <Suspense fallback={null}>
            <Flash />
          </Suspense>
          {children}
        </main>
      </body>
    </html>
  );
}

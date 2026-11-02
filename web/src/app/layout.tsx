import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { signOut } from "./actions";
import { LeafIcon } from "@/components/icons";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Pflanzen", template: "%s · Pflanzen" },
  description: "Smart Plant Monitor: Feuchte, Licht und Gießempfehlungen für deine Zimmerpflanzen",
  appleWebApp: { capable: true, title: "Pflanzen", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/80">
          <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 text-sm">
            <Link href="/" className="mr-3 flex items-center gap-2 font-semibold">
              <LeafIcon className="size-5 text-emerald-600" />
              Pflanzen
            </Link>
            <Link href="/" className="rounded-lg px-2.5 py-1.5 hover:bg-stone-200/60 dark:hover:bg-stone-800">
              Übersicht
            </Link>
            <Link href="/settings" className="rounded-lg px-2.5 py-1.5 hover:bg-stone-200/60 dark:hover:bg-stone-800">
              Einstellungen
            </Link>
            <form action={signOut} className="ml-auto">
              <button className="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800">
                Abmelden
              </button>
            </form>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

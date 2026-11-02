import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Nav, NavFallback, TabBar } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Mo'sSmartPlantCare", template: "%s · Mo'sSmartPlantCare" },
  description: "Mo'sSmartPlantCare: Feuchte, Licht und Gießempfehlungen für deine Zimmerpflanzen",
  appleWebApp: { capable: true, title: "Mo'sPlantCare", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#141411" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header
          className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur-xl dark:border-stone-800/70 dark:bg-stone-950/85"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Suspense fallback={<NavFallback />}>
            <Nav />
          </Suspense>
        </header>
        <main className="pb-tabbar mx-auto w-full max-w-5xl flex-1 px-4 pt-6" style={{ paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}>{children}</main>
        <Suspense>
          <TabBar />
        </Suspense>
      </body>
    </html>
  );
}

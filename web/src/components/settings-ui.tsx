import Link from "next/link";
import { ChevronIcon } from "@/components/icons";
import { NAV_BACK, NAV_FORWARD } from "@/components/page-transition";

// Building blocks of the settings pages: an iOS-style menu of rows, and the heading of a sub-page.

export function SettingsRow({ href, title, detail, warn, icon }: { href: string; title: string; detail: string; warn?: boolean; icon: React.ReactNode }) {
  return (
    <Link href={href} transitionTypes={NAV_FORWARD} className="row flex items-center gap-3 px-4 py-3.5 hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/40 dark:active:bg-stone-800">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className={`block truncate text-sm ${warn ? "text-amber-700 dark:text-amber-300" : "text-stone-500"}`}>{detail}</span>
      </span>
      <ChevronIcon className="size-4 shrink-0 text-stone-400" />
    </Link>
  );
}

export function SettingsHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="hidden text-sm text-stone-500 sm:block">
        <Link href="/settings" transitionTypes={NAV_BACK} className="hover:underline">Einstellungen</Link>
      </p>
      <h1>{title}</h1>
      {children && <p className="text-sm text-stone-500">{children}</p>}
    </div>
  );
}

import { ViewTransition } from "react";

// Directional page transitions (styles in globals.css). Links that go one level deeper carry
// NAV_FORWARD, back links NAV_BACK; anything else (tab switches, browser back, refresh) has no
// type and swaps without motion, like switching tabs in an iOS app.

export const NAV_FORWARD = ["nav-forward"];
export const NAV_BACK = ["nav-back"];

const DIRECTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/** Wraps a page's content; must sit in each page.tsx, since layouts don't remount on navigation. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={DIRECTION} exit={DIRECTION} default="none">
      {children}
    </ViewTransition>
  );
}

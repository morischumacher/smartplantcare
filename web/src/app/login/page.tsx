import type { Metadata } from "next";
import { LeafIcon } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <div className="mx-auto mt-10 max-w-sm sm:mt-20">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950">
          <LeafIcon className="size-8" />
        </span>
        <h1>Willkommen zurück</h1>
        <p className="mt-1 text-sm text-stone-500">Bodenfeuchte, Licht und Raumklima deiner Pflanzen – und wann sie Wasser brauchen.</p>
      </div>
      <LoginForm />
    </div>
  );
}

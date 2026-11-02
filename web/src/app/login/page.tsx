import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold">Willkommen zurück</h1>
      <p className="mb-6 text-sm text-stone-500">Melde dich an, um deine Pflanzen zu sehen.</p>
      <LoginForm />
    </div>
  );
}

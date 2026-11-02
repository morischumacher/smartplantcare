"use client";

import { useFormAction } from "@/components/form-status";
import { signIn } from "../actions";

export function LoginForm() {
  const [state, onSubmit, pending] = useFormAction(signIn);
  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="email">E-Mail</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Passwort</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && !state.ok && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Anmelden…" : "Anmelden"}</button>
    </form>
  );
}

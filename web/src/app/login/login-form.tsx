"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="email">E-Mail</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Passwort</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && !state.ok && <p className="text-sm text-rose-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Anmelden…" : "Anmelden"}</button>
    </form>
  );
}

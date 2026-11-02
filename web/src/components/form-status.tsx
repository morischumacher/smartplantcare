"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/app/actions";

export function FormStatus({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok) return <p role="alert" className="text-sm text-rose-600">{state.error}</p>;
  return state.message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null;
}

// Like useActionState with <form action>, but the form is only reset after a successful save.
// React resets uncontrolled forms after every action, so a validation error would wipe what was typed.
export function useFormAction<S extends { ok: boolean }>(fn: (prev: S | null, fd: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState(fn, null);
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    form.current = e.currentTarget;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}

"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { initialActionState, type ActionState } from "@/lib/admin/action-state";
import { cn } from "@/lib/utils";

export function SubmitButton({ children = "Salvar", variant = "primary", className, pendingLabel = "Salvando…" }: { children?: ReactNode; variant?: "primary" | "outline" | "danger" | "ghost"; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={cn("normal-case tracking-normal", className)}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("rounded-md px-3 py-2 text-sm", state.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
      {state.message}
    </p>
  );
}

/** Progressive form bound to a Server Action returning ActionState. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirmMessage,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {typeof children === "function" ? children(state) : children}
      <div className="mt-3 empty:hidden">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state.errors?.[name];
  return message ? <p className="mt-1.5 text-xs text-danger">{message}</p> : null;
}

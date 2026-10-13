"use client";

import { Loader2 } from "lucide-react";
import { createContext, use, useActionState, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { initialActionState, type ActionState } from "@/lib/admin/action-state";
import { cn } from "@/lib/utils";

/** Pending state of an ActionForm (it dispatches manually, so useFormStatus alone would not see it). */
const PendingContext = createContext(false);

export function SubmitButton({ children = "Salvar", variant = "primary", className, pendingLabel = "Salvando…" }: { children?: ReactNode; variant?: "primary" | "outline" | "danger" | "ghost"; className?: string; pendingLabel?: string }) {
  const { pending: formPending } = useFormStatus();
  const actionPending = use(PendingContext);
  const pending = formPending || actionPending;
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
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <PendingContext value={pending}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          // Dispatch by hand: with the plain action prop React clears every field after each
          // submission, wiping what the admin typed when the server rejects it. Fields are
          // cleared only on success, and only for "new item" forms (resetOnSuccess).
          e.preventDefault();
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(data));
        }}
      >
        {typeof children === "function" ? children(state) : children}
        <div className="mt-3 empty:hidden">
          <FormMessage state={state} />
        </div>
      </form>
    </PendingContext>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state.errors?.[name];
  return message ? <p className="mt-1.5 text-xs text-danger">{message}</p> : null;
}

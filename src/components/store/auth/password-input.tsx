"use client";

import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/form";
import { PASSWORD_RULES } from "@/lib/auth/password";
import { cn } from "@/lib/utils";

/** Password field with a discreet show / hide button. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <Input {...props} type={visible ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-ivory hover:text-ink"
      >
        {visible ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
      </button>
    </div>
  );
}

/** Password requirements, updated while the customer types. */
export function PasswordRules({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} aria-label="Requisitos da senha" className="grid gap-1.5 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={cn("flex items-center gap-2", ok ? "text-success" : "text-muted")}>
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} /> : <Circle className="h-3 w-3 shrink-0" strokeWidth={1.75} />}
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " (cumprido)" : " (pendente)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

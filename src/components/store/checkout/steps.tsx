import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type StepKey = "sacola" | "identificacao" | "pagamento" | "revisao";

const STEPS: { key: StepKey; label: string; short: string }[] = [
  { key: "sacola", label: "Sacola", short: "Sacola" },
  { key: "identificacao", label: "Identificação e entrega", short: "Entrega" },
  { key: "pagamento", label: "Pagamento", short: "Pagamento" },
  { key: "revisao", label: "Revisão", short: "Revisão" },
];

/** Checkout progress: the current step is highlighted; finished steps can be reopened. */
export function CheckoutSteps({ current, onSelect, reachable = [] }: { current: StepKey; onSelect?: (step: StepKey) => void; reachable?: StepKey[] }) {
  const index = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Etapas da compra" className="border-b border-line pb-5">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => {
          const done = i < index;
          const active = i === index;
          const canOpen = !active && (done || reachable.includes(step.key));
          const content = (
            <span className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-2.5 sm:text-left">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.75rem] font-semibold tabular-nums transition-colors",
                  active ? "border-rose-ink bg-rose-ink text-paper" : done ? "border-rose-ink bg-rose text-rose-ink" : "border-line bg-paper text-muted",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <span className={cn("text-[0.6875rem] leading-tight sm:text-[0.8125rem]", active ? "font-semibold text-ink" : done ? "text-ink" : "text-muted")}>
                <span className="sm:hidden">{step.short}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </span>
            </span>
          );
          return (
            <li key={step.key} aria-current={active ? "step" : undefined} className="relative min-w-0">
              {step.key === "sacola" && canOpen ? (
                <Link href="/carrinho" className="block rounded-sm hover:opacity-80">
                  {content}
                </Link>
              ) : canOpen && onSelect ? (
                <button type="button" onClick={() => onSelect(step.key)} className="block w-full rounded-sm hover:opacity-80">
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkVipConnection, chooseVipCommunity } from "@/lib/admin/actions/vip";
import type { Community } from "@/lib/vip/zapi";
import { cn } from "@/lib/utils";

/** Checks the Z-API number and lists its communities, so the admin picks the announcement group. */
export function ConnectionCheck({ currentGroupId }: { currentGroupId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; communities?: Community[] } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await checkVipConnection()))}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium transition hover:border-ink/40 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Verificar conexão e buscar comunidades
      </button>
      {result ? <p className={cn("rounded-md px-3 py-2 text-sm", result.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{result.message}</p> : null}
      {result?.communities?.length ? (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {result.communities.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-3 py-2">
              <span className="min-w-0">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-muted">{c.announcementGroupId ? `Grupo de avisos: ${c.announcementGroupId}` : "Grupo de avisos não encontrado"}</span>
              </span>
              {c.announcementGroupId ? (
                c.announcementGroupId === (chosen ?? currentGroupId) ? (
                  <span className="shrink-0 text-xs font-medium text-success">Escolhida</span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await chooseVipCommunity(c.name, c.announcementGroupId!);
                        if (res.ok) setChosen(c.announcementGroupId);
                        setResult((r) => (r ? { ...r, message: res.message ?? r.message, ok: res.ok } : r));
                        router.refresh();
                      })
                    }
                    className="shrink-0 rounded-md border border-ink bg-ink px-3 py-1 text-xs font-medium text-paper disabled:opacity-50"
                  >
                    Usar esta
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

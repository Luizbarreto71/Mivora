"use client";

import { ScanFace, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteMySkinReport, getMySkinReports, type SavedSkinReport } from "@/lib/skin/actions";
import { NEED_LABEL } from "@/lib/skin/taxonomy";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/** Skin analysis reports the customer chose to keep (text only), with deletion. Shown inside "Sua conta". */
export function SavedSkinReports() {
  const [reports, setReports] = useState<SavedSkinReport[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMySkinReports()
      .catch(() => [])
      .then((r) => !cancelled && setReports(r));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!reports) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <ScanFace className="h-4 w-4" strokeWidth={1.5} /> Relatórios da análise de pele
      </p>
      {reports.length === 0 ? (
        <p className="text-muted">
          Nenhum relatório salvo.{" "}
          <Link href="/analise-de-pele" className="underline underline-offset-2">
            Fazer uma análise
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {reports.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer">
                    <span className="font-medium">Análise de {dateFormat.format(new Date(r.analyzedAt))}</span>
                    {r.needs.length ? <span className="block text-xs text-muted">{r.needs.map((n) => NEED_LABEL[n.need]).join(" · ")}</span> : null}
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">{r.summary}</p>
                  {r.products.length ? (
                    <p className="mt-2 text-xs">
                      Produtos sugeridos:{" "}
                      {r.products.map((p, i) => (
                        <span key={p.id}>
                          {i ? ", " : ""}
                          <Link href={`/produtos/${p.slug}`} className="underline underline-offset-2">
                            {p.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </details>
                <button
                  type="button"
                  aria-label={`Excluir o relatório de ${dateFormat.format(new Date(r.analyzedAt))}`}
                  onClick={async () => {
                    const done = await deleteMySkinReport(r.id).catch(() => ({ ok: false }));
                    if (done.ok) setReports((list) => (list ?? []).filter((x) => x.id !== r.id));
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ivory hover:text-ink"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Guardamos só o texto e os produtos sugeridos, por até 12 meses. A foto nunca é salva.</p>
    </div>
  );
}

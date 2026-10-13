"use client";

import { useActionState } from "react";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { importCatalog, type ImportReport } from "@/lib/admin/actions/import";
import { cn } from "@/lib/utils";
import { FormMessage, SubmitButton } from "./form-kit";

const TONE = { criado: "text-success", atualizado: "text-ink", "sem alterações": "text-muted", erro: "text-danger" } as const;

export function ImportForm() {
  const [state, action] = useActionState<ImportReport, FormData>(importCatalog, { ok: false });
  return (
    <form action={action} className="space-y-5">
      <Field label="Arquivo CSV" htmlFor="file">
        <input id="file" name="file" type="file" accept=".csv,text/csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-paper file:px-3 file:py-2" />
      </Field>
      <Field label="…ou cole o conteúdo" htmlFor="csv">
        <Textarea id="csv" name="csv" rows={6} className="font-mono text-xs" placeholder={"slug;nome;marca;volume;categorias\nmeu-produto;Nome do produto;SKIN1004;100 ml;seruns-hidratantes|hidratacao"} />
      </Field>
      <Checkbox name="dryRun" defaultChecked label="Somente simular (mostra o que mudaria, sem gravar)" />
      <SubmitButton pendingLabel="Processando…">Processar planilha</SubmitButton>
      <FormMessage state={state} />
      {state.lines?.length ? (
        <div className="max-h-96 overflow-auto rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-ivory/60">
              <tr>
                <th className="px-3 py-2">Linha</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">{state.dryRun ? "Resultado previsto" : "Resultado"}</th>
                <th className="px-3 py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {state.lines.map((l) => (
                <tr key={l.line} className="border-t border-line">
                  <td className="px-3 py-1.5 tabular-nums">{l.line}</td>
                  <td className="px-3 py-1.5">{l.slug}</td>
                  <td className={cn("px-3 py-1.5 font-medium", TONE[l.result])}>{l.result}</td>
                  <td className="px-3 py-1.5 text-muted">{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </form>
  );
}

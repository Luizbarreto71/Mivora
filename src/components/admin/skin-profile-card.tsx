import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { Card } from "@/components/admin/ui";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { saveSkinProfile } from "@/lib/admin/actions/skin";
import { ROUTINE_STEP_LABEL, ROUTINE_STEPS, type RoutineStep, type RoutineTime } from "@/lib/skin/taxonomy";

export type SkinProfileRow = {
  recommendable: boolean;
  routine_step: RoutineStep | null;
  routine_time: RoutineTime | null;
  precautions: string | null;
  alternative_product_id: string | null;
};

const TIME_LABEL: Record<RoutineTime, string> = { manha: "Manhã", noite: "Noite", ambos: "Manhã e noite" };

/** How the product takes part in the skin analysis recommendations. Needs and step come from the categories by default. */
export function SkinProfileCard({
  productId,
  profile,
  derived,
  alternatives,
}: {
  productId: string;
  profile: SkinProfileRow | null;
  derived: { needs: string[]; step: RoutineStep | null; time: RoutineTime | null; benefits: number; warnings: boolean };
  alternatives: { id: string; name: string }[];
}) {
  return (
    <Card
      title="Análise de pele"
      description="Como este produto entra nas sugestões da Análise de Pele com IA. As necessidades vêm das categorias de necessidade marcadas acima e a etapa vem do tipo de produto; os benefícios, o modo de uso e os avisos do cadastro aparecem como justificativa para a cliente."
      className="mt-6"
    >
      <ActionForm action={saveSkinProfile} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="product_id" value={productId} />
        <div className="space-y-1 rounded-md bg-ivory p-3 text-xs leading-relaxed text-ink-soft sm:col-span-2">
          <p>
            <strong>Necessidades atendidas (pelas categorias):</strong> {derived.needs.length ? derived.needs.join(", ") : "nenhuma — marque categorias de necessidade para o produto ser sugerido"}
          </p>
          <p>
            <strong>Etapa automática (pelo tipo):</strong> {derived.step ? ROUTINE_STEP_LABEL[derived.step] : "sem etapa — o produto não entra na rotina"}
            {derived.time ? ` · ${TIME_LABEL[derived.time]}` : ""}
          </p>
          <p>
            <strong>Benefícios cadastrados:</strong> {derived.benefits} · <strong>Avisos:</strong> {derived.warnings ? "cadastrados" : "nenhum"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <Checkbox name="recommendable" label="Pode aparecer nas recomendações da análise de pele" defaultChecked={profile?.recommendable ?? true} />
        </div>
        <Field label="Etapa da rotina" htmlFor="routine_step" hint="Deixe em automático para usar o tipo de produto">
          <Select id="routine_step" name="routine_step" defaultValue={profile?.routine_step ?? ""}>
            <option value="">Automática{derived.step && !profile?.routine_step ? ` (${ROUTINE_STEP_LABEL[derived.step]})` : ""}</option>
            {ROUTINE_STEPS.map((s) => (
              <option key={s} value={s}>
                {ROUTINE_STEP_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Horário de uso" htmlFor="routine_time" hint="Automático: protetor de manhã; máscaras e ativos renovadores (tags retinoide/esfoliante) à noite">
          <Select id="routine_time" name="routine_time" defaultValue={profile?.routine_time ?? ""}>
            <option value="">Automático</option>
            <option value="manha">Manhã</option>
            <option value="noite">Noite</option>
            <option value="ambos">Manhã e noite</option>
          </Select>
        </Field>
        <Field label="Precauções para a análise (opcional)" htmlFor="precautions" hint="Somente informações confirmadas na embalagem ou no material oficial. Até 600 caracteres." className="sm:col-span-2">
          <Textarea id="precautions" name="precautions" rows={2} defaultValue={profile?.precautions ?? ""} />
        </Field>
        <Field label="Alternativa quando este produto estiver indisponível" htmlFor="alternative_product_id" hint="Só é sugerida se estiver disponível e for da mesma etapa ou atender a mesma necessidade" className="sm:col-span-2">
          <Select id="alternative_product_id" name="alternative_product_id" defaultValue={profile?.alternative_product_id ?? ""}>
            <option value="">Nenhuma</option>
            {alternatives.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <SubmitButton variant="outline">Salvar análise de pele</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

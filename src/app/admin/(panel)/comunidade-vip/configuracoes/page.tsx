import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card } from "@/components/admin/ui";
import { ConnectionCheck } from "@/components/admin/vip/connection-check";
import { NotMigrated } from "@/components/admin/vip/not-migrated";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { saveVipSettings } from "@/lib/admin/actions/vip";
import { requireAdmin } from "@/lib/admin/auth";
import { loadVipSettings, sendingBlockers } from "@/lib/vip/pipeline";
import { zapiConfigured } from "@/lib/vip/zapi";

export const metadata: Metadata = { title: "Configurações do envio · Comunidade VIP" };

export default async function VipSettingsPage() {
  const { supabase } = await requireAdmin();
  const settings = await loadVipSettings(supabase);
  if (!settings) return <NotMigrated />;
  const blockers = sendingBlockers(settings);

  return (
    <AdminPage
      title="Configurações do envio"
      back={{ href: "/admin/comunidade-vip", label: "Comunidade VIP" }}
      description="Os posts saem pela Z-API, com o número dedicado à comunidade (nunca o número da loja), no grupo de avisos da comunidade."
    >
      <div className="space-y-6">
        <Card title="1. Número da comunidade (Z-API)">
          {zapiConfigured() ? (
            <ConnectionCheck currentGroupId={settings.announcement_group_id} />
          ) : (
            <div className="space-y-2 text-sm">
              <p>As chaves da Z-API ainda não estão no servidor. Para ligar:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Crie uma instância na Z-API e leia o QR Code com o WhatsApp do chip da comunidade.</li>
                <li>Adicione esse número como administrador da comunidade no WhatsApp.</li>
                <li>
                  Cadastre no servidor (Vercel e Hostinger) as variáveis <code>ZAPI_INSTANCE_ID</code>, <code>ZAPI_INSTANCE_TOKEN</code> e, se o token de segurança da conta estiver ligado, <code>ZAPI_CLIENT_TOKEN</code>.
                </li>
              </ol>
            </div>
          )}
        </Card>

        <Card title="2. Comunidade, horários e texto">
          <ActionForm action={saveVipSettings} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da comunidade" htmlFor="community_name">
              <Input id="community_name" name="community_name" defaultValue={settings.community_name ?? ""} maxLength={120} />
            </Field>
            <Field label="Código do grupo de avisos" htmlFor="announcement_group_id" hint="Preenchido ao escolher a comunidade acima">
              <Input id="announcement_group_id" name="announcement_group_id" defaultValue={settings.announcement_group_id ?? ""} maxLength={46} />
            </Field>
            <Field label="Primeiro post do dia" htmlFor="first_post_time">
              <Input id="first_post_time" name="first_post_time" type="time" defaultValue={settings.first_post_time.slice(0, 5)} required />
            </Field>
            <Field label="Último post do dia" htmlFor="last_post_time">
              <Input id="last_post_time" name="last_post_time" type="time" defaultValue={settings.last_post_time.slice(0, 5)} required />
            </Field>
            <Field label="Intervalo entre posts (minutos)" htmlFor="interval_minutes" hint="De 15 a 720. O que não couber no dia passa para o dia seguinte.">
              <Input id="interval_minutes" name="interval_minutes" inputMode="numeric" defaultValue={settings.interval_minutes} required />
            </Field>
            <Field label="Não repetir o mesmo perfume por (dias)" htmlFor="dedupe_days" hint="Posts repetidos nesse período ficam para revisão">
              <Input id="dedupe_days" name="dedupe_days" inputMode="numeric" defaultValue={settings.dedupe_days} required />
            </Field>
            <Field
              label="Fechamento de todos os posts"
              htmlFor="footer"
              hint="Como pedir. Ex.: Para garantir o seu, chame no privado: wa.me/55… (até 300 caracteres)"
              className="sm:col-span-2"
            >
              <Textarea id="footer" name="footer" rows={3} defaultValue={settings.footer ?? ""} maxLength={300} />
            </Field>
            <Field label="Seu WhatsApp para prévias" htmlFor="preview_phone" hint="Com DDI e DDD, ex.: 5511999999999. Recebe a prévia de um post antes da comunidade.">
              <Input id="preview_phone" name="preview_phone" inputMode="tel" defaultValue={settings.preview_phone ?? ""} maxLength={20} />
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <Checkbox
                name="sending_enabled"
                defaultChecked={settings.sending_enabled}
                label="Envio automático ligado: posts aprovados saem sozinhos nos horários. Desmarque para pausar tudo."
              />
              {blockers.length > 0 ? <p className="text-xs text-warning">Ainda falta: {blockers.join(" ")}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Salvar configurações</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </AdminPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteDeliveryZone, saveDeliveryZone, saveSettings } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";
import { DEFAULT_SETTINGS } from "@/lib/catalog/queries";
import { SITE_URL } from "@/lib/env";
import { centsToInput } from "@/lib/money";
import { applePayConfig } from "@/lib/payments/apple-pay";
import { checkMercadoPago, mercadoPagoConfig } from "@/lib/payments/mercadopago";
import { formatCep } from "@/lib/shipping/cep";
import { skinAiConfigured } from "@/lib/skin/ai";
import { isServiceRoleConfigured } from "@/lib/supabase/service";
import { checkMelhorEnvio, melhorEnvioConfig } from "@/lib/shipping/quote";
import { formatCepRange } from "@/lib/shipping/zones";
import { DELIVERY_METHOD_LABEL, type DeliveryMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Configurações" };

type Zone = { id: string; name: string; region: string | null; method: DeliveryMethod; fee_cents: number | null; free_over_cents: number | null; min_order_cents: number | null; estimate: string | null; notes: string | null; is_active: boolean; sort_order: number; cep_ranges: string[]; cities: string[] };

function ZoneForm({ zone }: { zone?: Zone }) {
  return (
    <ActionForm action={saveDeliveryZone} resetOnSuccess={!zone} className="grid gap-3 sm:grid-cols-4">
      {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
      <Field label="Nome" className="sm:col-span-2">
        <Input name="name" defaultValue={zone?.name ?? ""} placeholder="Ex.: Entrega local — Centro" required />
      </Field>
      <Field label="Modalidade">
        <Select name="method" defaultValue={zone?.method ?? "local_delivery"}>
          {Object.entries(DELIVERY_METHOD_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Região / cidade">
        <Input name="region" defaultValue={zone?.region ?? ""} />
      </Field>
      <Field label="Taxa (R$)" hint="Vazio = a combinar">
        <Input name="fee" inputMode="decimal" defaultValue={centsToInput(zone?.fee_cents)} />
      </Field>
      <Field label="Grátis acima de (R$)" hint="Opcional">
        <Input name="free_over" inputMode="decimal" defaultValue={centsToInput(zone?.free_over_cents)} />
      </Field>
      <Field label="Pedido mínimo (R$)" hint="Opcional">
        <Input name="min_order" inputMode="decimal" defaultValue={centsToInput(zone?.min_order_cents)} />
      </Field>
      <Field label="Prazo estimado" hint="Ex.: 1 a 2 dias úteis">
        <Input name="estimate" defaultValue={zone?.estimate ?? ""} />
      </Field>
      <Field label="Observações" className="sm:col-span-3">
        <Input name="notes" defaultValue={zone?.notes ?? ""} />
      </Field>
      <Field label="Ordem">
        <Input name="sort_order" inputMode="numeric" defaultValue={zone?.sort_order ?? 0} />
      </Field>
      <Field label="Faixas de CEP atendidas" hint="Uma por linha. Ex.: 29000-000 a 29099-999, ou 290 para todos os CEPs que começam com 290" className="sm:col-span-2">
        <Textarea name="cep_ranges" rows={3} defaultValue={(zone?.cep_ranges ?? []).map(formatCepRange).join("\n")} placeholder={"29000-000 a 29099-999"} />
      </Field>
      <Field label="Cidades atendidas" hint="Uma por linha, com a UF. Ex.: Vitória/ES" className="sm:col-span-2">
        <Textarea name="cities" rows={3} defaultValue={(zone?.cities ?? []).join("\n")} placeholder={"Vitória/ES"} />
      </Field>
      <p className="text-xs text-muted sm:col-span-4">Com as duas listas vazias, a opção aparece para qualquer CEP. Preenchidas, aparece apenas para os CEPs e cidades informados.</p>
      <div className="flex items-center gap-4 sm:col-span-4">
        <Checkbox name="is_active" label="Ativa" defaultChecked={zone?.is_active ?? true} />
        <SubmitButton variant={zone ? "outline" : "primary"}>{zone ? "Salvar" : "Adicionar opção"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [{ data: s }, { data: zones }, { data: skinUsage }] = await Promise.all([
    supabase.from("store_settings").select("*").eq("id", 1).single(),
    supabase.from("delivery_zones").select("*").order("sort_order"),
    supabase.from("skin_analysis_usage").select("analyses").eq("day", today).maybeSingle(),
  ]);
  const v = s ?? {};
  const skinAi = skinAiConfigured();
  const skinStatus = !skinAi
    ? {
        tone: "text-warning",
        text: "Falta a chave da IA: crie uma chave em console.anthropic.com (API Keys) e cadastre-a na variável ANTHROPIC_API_KEY do servidor (Vercel e Hostinger); depois faça um novo deploy. Por segurança, a chave nunca é salva no banco nem aparece no site. Sem ela, o pop-up, a seção da home e o menu ficam ocultos e a página da análise mostra que o recurso está indisponível.",
      }
    : v.skin_analysis_enabled === false
      ? { tone: "text-muted", text: "IA conectada (Claude, da Anthropic). Marque a opção acima para mostrar a análise na loja." }
      : { tone: "text-success", text: "No ar: pop-up de lançamento, seção da home, menu e página /analise-de-pele, com a análise feita pelo Claude (Anthropic) a partir do servidor." };
  const me = melhorEnvioConfig({ contact_email: v.contact_email ?? null });
  // live test quote, so an expired or revoked token shows up here
  const check = me.ready && v.shipping_origin_cep ? await checkMelhorEnvio({ ...DEFAULT_SETTINGS, ...v }) : null;
  const mp = mercadoPagoConfig();
  const mpCheck = mp.token ? await checkMercadoPago() : null;
  const mpLines: { ok: boolean | null; text: string }[] = [
    !mp.token
      ? { ok: false, text: "Credencial do Mercado Pago (MERCADOPAGO_ACCESS_TOKEN) não configurada no servidor." }
      : mpCheck?.ok
        ? { ok: true, text: `Conectado ao Mercado Pago${mpCheck.nickname ? ` (conta ${mpCheck.nickname})` : ""}${mpCheck.test ? " — credencial de TESTE: pagamentos não são reais" : ""}.` }
        : mpCheck && (mpCheck.status === 401 || mpCheck.status === 403)
          ? { ok: false, text: "O Mercado Pago recusou a credencial (MERCADOPAGO_ACCESS_TOKEN). Confira se copiou o Access Token de produção da aplicação." }
          : { ok: null, text: `Não foi possível testar a conexão com o Mercado Pago agora${mpCheck?.status ? ` (resposta ${mpCheck.status})` : ""}.` },
    mp.serviceRole
      ? { ok: true, text: "Chave de serviço do Supabase configurada (registra os pagamentos aprovados)." }
      : { ok: false, text: "Chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY) não configurada: sem ela, o site não consegue registrar os pagamentos." },
    mp.webhookSecret
      ? { ok: true, text: "Assinatura dos avisos do Mercado Pago verificada (MERCADOPAGO_WEBHOOK_SECRET)." }
      : { ok: null, text: "Recomendado: cadastre a chave secreta do webhook (MERCADOPAGO_WEBHOOK_SECRET) para recusar avisos falsificados." },
  ];
  const ap = applePayConfig({ ...DEFAULT_SETTINGS, ...v });
  const apMissing = [
    !mp.ready && "as credenciais do Mercado Pago e do Supabase no servidor",
    !v.online_payment_enabled && "ligar o pagamento pelo site",
    !v.apple_pay_merchant_id && "o Merchant ID",
    !v.mercadopago_public_key && "a Public Key",
    !v.apple_pay_certificate_id && "o ID do certificado",
    !v.apple_pay_product_id && "o Product ID",
  ].filter(Boolean) as string[];
  const apStatus = ap.ready
    ? { tone: "text-success", text: "Pronto: o botão do Apple Pay aparece no checkout para clientes com Apple Pay no aparelho." }
    : apMissing.length === 0
      ? { tone: "text-muted", text: "Tudo configurado. Marque a opção acima para mostrar o Apple Pay na loja." }
      : { tone: v.apple_pay_enabled ? "text-warning" : "text-muted", text: `Para o Apple Pay aparecer na loja, falta: ${apMissing.join(", ")}.` };
  const carrier = !me.token
    ? {
        tone: "text-muted",
        text: "Para cotar Correios e transportadoras: crie uma conta no Melhor Envio, gere um token em melhorenvio.com.br/painel/gerenciar/tokens (“Novo token”, com as permissões de cotação de frete) e cadastre-o na variável de ambiente MELHOR_ENVIO_TOKEN do servidor (Vercel ou Hostinger). Por segurança, o token nunca é salvo no banco de dados. Sem ele, a calculadora mostra apenas as opções de entrega cadastradas abaixo.",
      }
    : !v.shipping_origin_cep
        ? { tone: "text-warning", text: "Token encontrado. Informe o CEP de origem para ativar as cotações." }
        : check?.ok && check.services > 0
          ? {
              tone: "text-success",
              text: `Melhor Envio conectado${me.sandbox ? " (ambiente de testes — sandbox)" : ""}: a cotação de teste respondeu com ${check.services} ${check.services === 1 ? "serviço" : "serviços"}.${v.carrier_quotes_enabled ? "" : " Marque a opção acima para mostrar as cotações na loja."}${me.email ? "" : " Recomendado: preencha o e-mail de contato da loja, que o Melhor Envio pede nas consultas."}`,
            }
          : check?.ok
            ? { tone: "text-warning", text: "Melhor Envio conectado, mas a cotação de teste não trouxe nenhum serviço. Confira as transportadoras habilitadas na sua conta do Melhor Envio." }
            : check?.status === 401 || check?.status === 403
              ? { tone: "text-danger", text: "O Melhor Envio recusou o token: ele pode ter expirado ou estar sem permissão de cotação. Gere um novo token e atualize MELHOR_ENVIO_TOKEN no servidor." }
              : {
                  tone: "text-warning",
                  text: `Não foi possível testar a conexão com o Melhor Envio agora${check?.status ? ` (resposta ${check.status})` : ""}. Enquanto isso, a loja mostra apenas as opções de entrega cadastradas.`,
                };

  return (
    <AdminPage title="Configurações da loja" description="Contato, WhatsApp, dados legais, avisos, textos institucionais e entrega.">
      <ActionForm action={saveSettings} className="space-y-6">
        <Card title="WhatsApp e atendimento">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Número do WhatsApp da loja" htmlFor="whatsapp_number" hint="Com DDD. Ex.: 11 91234-5678 (o código 55 é adicionado automaticamente)">
              <Input id="whatsapp_number" name="whatsapp_number" defaultValue={v.whatsapp_number ?? ""} inputMode="tel" />
            </Field>
            <Field label="Saudação das mensagens" htmlFor="whatsapp_greeting">
              <Input id="whatsapp_greeting" name="whatsapp_greeting" defaultValue={v.whatsapp_greeting ?? "Olá, MIVORA!"} />
            </Field>
            <Field label="Horário de atendimento" htmlFor="business_hours" hint="Ex.: Seg. a sex., 9h às 18h">
              <Input id="business_hours" name="business_hours" defaultValue={v.business_hours ?? ""} />
            </Field>
            <Field label="Telefone" htmlFor="contact_phone">
              <Input id="contact_phone" name="contact_phone" defaultValue={v.contact_phone ?? ""} />
            </Field>
            <Field label="E-mail de contato" htmlFor="contact_email">
              <Input id="contact_email" name="contact_email" type="email" defaultValue={v.contact_email ?? ""} />
            </Field>
            <Field label="Bloco de atendimento na home — título" htmlFor="whatsapp_section_title" hint="Aparece no lugar dos depoimentos enquanto não houver depoimentos publicados">
              <Input id="whatsapp_section_title" name="whatsapp_section_title" defaultValue={v.whatsapp_section_title ?? ""} />
            </Field>
            <Field label="Bloco de atendimento na home — texto" htmlFor="whatsapp_section_text" className="sm:col-span-2">
              <Textarea id="whatsapp_section_text" name="whatsapp_section_text" rows={2} defaultValue={v.whatsapp_section_text ?? ""} />
            </Field>
          </div>
        </Card>

        <Card title="Redes sociais">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Instagram" htmlFor="instagram_url">
              <Input id="instagram_url" name="instagram_url" defaultValue={v.instagram_url ?? ""} placeholder="https://instagram.com/…" />
            </Field>
            <Field label="TikTok" htmlFor="tiktok_url">
              <Input id="tiktok_url" name="tiktok_url" defaultValue={v.tiktok_url ?? ""} placeholder="https://" />
            </Field>
            <Field label="Facebook" htmlFor="facebook_url">
              <Input id="facebook_url" name="facebook_url" defaultValue={v.facebook_url ?? ""} placeholder="https://" />
            </Field>
          </div>
        </Card>

        <Card title="Dados legais" description="Exibidos no rodapé e na página de contato somente quando preenchidos.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Razão social" htmlFor="legal_name">
              <Input id="legal_name" name="legal_name" defaultValue={v.legal_name ?? ""} />
            </Field>
            <Field label="CNPJ" htmlFor="cnpj">
              <Input id="cnpj" name="cnpj" defaultValue={v.cnpj ?? ""} />
            </Field>
            <Field label="Endereço" htmlFor="address" className="sm:col-span-2">
              <Input id="address" name="address" defaultValue={v.address ?? ""} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox name="show_registered_mark" label="Exibir o símbolo ® no logotipo (somente com registro de marca confirmado)" defaultChecked={v.show_registered_mark ?? false} />
            </div>
          </div>
        </Card>

        <Card title="Oferta de boas-vindas" description="Exibida na apresentação de entrada do site, na faixa do topo, no carrinho e na finalização. O desconto vale sobre os produtos com preço.">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex items-end pb-2 sm:col-span-3">
              <Checkbox name="welcome_offer_enabled" label="Oferta ativa (desconto na primeira compra)" defaultChecked={v.welcome_offer_enabled ?? true} />
            </div>
            <Field label="Desconto (%)" htmlFor="welcome_offer_percent">
              <Input id="welcome_offer_percent" name="welcome_offer_percent" inputMode="numeric" defaultValue={v.welcome_offer_percent ?? 10} />
            </Field>
            <Field label="Código do cupom" htmlFor="welcome_offer_code" hint="Letras e números, 3 a 20 caracteres">
              <Input id="welcome_offer_code" name="welcome_offer_code" defaultValue={v.welcome_offer_code ?? "BEMVINDA10"} className="uppercase" />
            </Field>
          </div>
        </Card>

        <Card title="Produtos “Em breve”">
          <Checkbox
            name="coming_soon_inquiry_enabled"
            label="Mostrar o botão “Consultar previsão de chegada” (abre o WhatsApp com uma mensagem informando que o produto ainda não está disponível)"
            defaultChecked={v.coming_soon_inquiry_enabled ?? true}
          />
        </Card>

        <Card
          title="Barra superior e newsletter"
          description="Mensagens da faixa preta acima do cabeçalho. Publique apenas o que a loja cumpre (por exemplo, não anuncie entrega para todo o Brasil sem confirmar)."
        >
          <div className="grid gap-5">
            <Field label="Mensagens da barra superior" htmlFor="top_bar_messages" hint="Uma por linha, até 4 (até 90 caracteres cada). A oferta de boas-vindas ativa entra automaticamente como primeira mensagem.">
              <Textarea id="top_bar_messages" name="top_bar_messages" rows={3} defaultValue={(v.top_bar_messages ?? []).join("\n")} />
            </Field>
            <Checkbox name="newsletter_enabled" label="Mostrar a inscrição na newsletter no rodapé" defaultChecked={v.newsletter_enabled ?? true} />
          </div>
        </Card>

        <Card title="Aviso no topo do site" description="Quando ativo, substitui as mensagens da barra superior (use para campanhas).">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Texto do aviso" htmlFor="announcement_text">
              <Input id="announcement_text" name="announcement_text" defaultValue={v.announcement_text ?? ""} />
            </Field>
            <Field label="Link (opcional)" htmlFor="announcement_href">
              <Input id="announcement_href" name="announcement_href" defaultValue={v.announcement_href ?? ""} placeholder="/produtos" />
            </Field>
            <Checkbox name="announcement_enabled" label="Exibir aviso" defaultChecked={v.announcement_enabled ?? false} />
          </div>
        </Card>

        <Card
          title="Calculadora de frete"
          description="O cliente informa o CEP na página do produto, no carrinho ou na finalização e vê as opções de entrega com valor e prazo. Tudo é estimativa, confirmada no WhatsApp."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Checkbox name="shipping_calculator_enabled" label="Mostrar a calculadora de frete na loja" defaultChecked={v.shipping_calculator_enabled ?? true} />
            </div>
            <Field label="CEP de origem (de onde os pedidos saem)" htmlFor="shipping_origin_cep" hint="Necessário para cotar Correios e transportadoras">
              <Input id="shipping_origin_cep" name="shipping_origin_cep" inputMode="numeric" placeholder="00000-000" defaultValue={v.shipping_origin_cep ? formatCep(v.shipping_origin_cep) : ""} />
            </Field>
            <Field label="Dias para preparar o pedido" htmlFor="shipping_handling_days" hint="Somados ao prazo das transportadoras">
              <Input id="shipping_handling_days" name="shipping_handling_days" inputMode="numeric" defaultValue={v.shipping_handling_days ?? 1} />
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <Checkbox name="carrier_quotes_enabled" label="Cotar Correios e transportadoras pelo Melhor Envio" defaultChecked={v.carrier_quotes_enabled ?? false} />
              <p className={cn("text-xs leading-relaxed", carrier.tone)}>{carrier.text}</p>
            </div>
            <Field label="Acréscimo sobre o frete cotado (%)" htmlFor="shipping_markup_percent" hint="Opcional">
              <Input id="shipping_markup_percent" name="shipping_markup_percent" inputMode="decimal" defaultValue={String(v.shipping_markup_percent ?? 0).replace(".", ",")} />
            </Field>
            <Field label="Valor fixo por envio (R$)" htmlFor="shipping_extra" hint="Opcional. Ex.: custo da embalagem">
              <Input id="shipping_extra" name="shipping_extra" inputMode="decimal" defaultValue={v.shipping_extra_cents ? centsToInput(v.shipping_extra_cents) : ""} />
            </Field>
            <Field label="Máximo de opções de transportadora" htmlFor="shipping_max_carrier_options" hint="A mais rápida e as mais baratas (0 = mostrar todas)">
              <Input id="shipping_max_carrier_options" name="shipping_max_carrier_options" inputMode="numeric" defaultValue={v.shipping_max_carrier_options ?? 4} />
            </Field>
            <Field label="Peso padrão por produto, com embalagem (g)" htmlFor="shipping_default_weight_g" hint="Vale para produtos sem peso cadastrado">
              <Input id="shipping_default_weight_g" name="shipping_default_weight_g" inputMode="numeric" defaultValue={v.shipping_default_weight_g ?? 300} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Altura (cm)" htmlFor="shipping_default_height_cm">
                <Input id="shipping_default_height_cm" name="shipping_default_height_cm" inputMode="numeric" defaultValue={v.shipping_default_height_cm ?? 6} />
              </Field>
              <Field label="Largura (cm)" htmlFor="shipping_default_width_cm">
                <Input id="shipping_default_width_cm" name="shipping_default_width_cm" inputMode="numeric" defaultValue={v.shipping_default_width_cm ?? 11} />
              </Field>
              <Field label="Compr. (cm)" htmlFor="shipping_default_length_cm">
                <Input id="shipping_default_length_cm" name="shipping_default_length_cm" inputMode="numeric" defaultValue={v.shipping_default_length_cm ?? 16} />
              </Field>
            </div>
          </div>
        </Card>

        <Card
          title="Pagamento pelo site (Mercado Pago)"
          description="O cliente paga com Pix, cartão de crédito ou boleto na página segura do Mercado Pago e volta para a página do pedido. A loja não recebe dados de cartão. Quando o pagamento é aprovado, o pedido é confirmado e o estoque é reservado automaticamente."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Checkbox name="online_payment_enabled" label="Oferecer pagamento pelo site (Pix, cartão e boleto)" defaultChecked={v.online_payment_enabled ?? false} />
              {v.online_payment_enabled && !mp.ready ? <p className="text-xs text-warning">Ativado, mas só aparece na loja quando as credenciais abaixo estiverem configuradas no servidor.</p> : null}
            </div>
            <Field label="Parcelamento máximo no cartão" htmlFor="online_payment_max_installments" hint="Os juros seguem a configuração da sua conta Mercado Pago">
              <Select id="online_payment_max_installments" name="online_payment_max_installments" defaultValue={String(v.online_payment_max_installments ?? 12)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "À vista (1x)" : `Até ${n}x`}
                  </option>
                ))}
              </Select>
            </Field>
            <ul className="space-y-1.5 text-xs leading-relaxed sm:col-span-2">
              {mpLines.map((l) => (
                <li key={l.text} className={cn(l.ok === true ? "text-success" : l.ok === false ? "text-danger" : "text-warning")}>
                  {l.ok === true ? "✓ " : l.ok === false ? "✕ " : "! "}
                  {l.text}
                </li>
              ))}
              <li className="text-muted">
                Endereço de avisos (webhook), cadastrado no painel do Mercado Pago com o evento Pagamentos: <code className="break-all">{SITE_URL}/api/mercadopago/webhook</code>
              </li>
              <li className="text-muted">Pedidos com itens “Sob consulta” ou entrega “a combinar” continuam sendo finalizados pelo WhatsApp.</li>
            </ul>
          </div>
        </Card>

        <Card
          title="Apple Pay (Mercado Pago)"
          description="Botão de Apple Pay no checkout para clientes com iPhone, iPad ou Mac no Safari: cartões de crédito Visa e Mastercard, à vista, com o CPF exigido pelo Mercado Pago. Precisa da habilitação do time comercial do Mercado Pago, de um Merchant ID no Apple Developer e dos certificados cadastrados no Mercado Pago."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Checkbox name="apple_pay_enabled" label="Oferecer Apple Pay no checkout" defaultChecked={v.apple_pay_enabled ?? false} />
              <p className={cn("text-xs leading-relaxed", apStatus.tone)}>{apStatus.text}</p>
            </div>
            <Field label="Merchant ID (Apple)" htmlFor="apple_pay_merchant_id" hint="Ex.: merchant.br.com.mivoracosmeticos">
              <Input id="apple_pay_merchant_id" name="apple_pay_merchant_id" defaultValue={v.apple_pay_merchant_id ?? ""} placeholder="merchant.br.com.mivoracosmeticos" />
            </Field>
            <Field label="Public Key do Mercado Pago" htmlFor="mercadopago_public_key" hint="Credenciais de produção da aplicação. Nunca cole aqui o Access Token.">
              <Input id="mercadopago_public_key" name="mercadopago_public_key" defaultValue={v.mercadopago_public_key ?? ""} placeholder="APP_USR-00000000-0000-0000-0000-000000000000" />
            </Field>
            <Field label="ID do certificado de comerciante" htmlFor="apple_pay_certificate_id" hint="certificate_id gerado no Mercado Pago">
              <Input id="apple_pay_certificate_id" name="apple_pay_certificate_id" defaultValue={v.apple_pay_certificate_id ?? ""} />
            </Field>
            <Field label="Product ID (X-Product-ID)" htmlFor="apple_pay_product_id" hint="Informado pelo Mercado Pago">
              <Input id="apple_pay_product_id" name="apple_pay_product_id" defaultValue={v.apple_pay_product_id ?? ""} />
            </Field>
            <Field
              label="Arquivo de verificação de domínio da Apple"
              htmlFor="apple_pay_domain_association"
              hint={
                <>
                  Cole o conteúdo do arquivo baixado no portal Apple Developer. Ele fica publicado em <code className="break-all">{SITE_URL}/.well-known/apple-developer-merchantid-domain-association.txt</code>
                </>
              }
              className="sm:col-span-2"
            >
              <Textarea id="apple_pay_domain_association" name="apple_pay_domain_association" rows={3} className="font-mono text-xs" defaultValue={v.apple_pay_domain_association ?? ""} />
            </Field>
          </div>
        </Card>

        <Card
          title="Análise de Pele com IA"
          description="A cliente envia uma foto do rosto, recebe uma análise visual cosmética e sugestões de produtos do catálogo. A foto é analisada em memória e descartada; nada é salvo sem um consentimento à parte."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Checkbox name="skin_analysis_enabled" label="Mostrar a Análise de Pele com IA na loja" defaultChecked={v.skin_analysis_enabled ?? true} />
              <p className={cn("text-xs leading-relaxed", skinStatus.tone)}>{skinStatus.text}</p>
            </div>
            <Field label="Intervalo do pop-up (dias)" htmlFor="skin_popup_interval_days" hint="0 = o pop-up aparece toda vez que o site é carregado ou recarregado. De 1 a 90 = depois de fechado, só volta nesse navegador após esse número de dias.">
              <Input id="skin_popup_interval_days" name="skin_popup_interval_days" inputMode="numeric" defaultValue={v.skin_popup_interval_days ?? 0} />
            </Field>
            <Field
              label="Limite de análises por dia"
              htmlFor="skin_analysis_daily_limit"
              hint={`Controla o custo da IA (cada análise é cobrada pela Anthropic). Hoje: ${skinUsage?.analyses ?? 0} ${(skinUsage?.analyses ?? 0) === 1 ? "análise" : "análises"}.${isServiceRoleConfigured() ? "" : " Atenção: sem SUPABASE_SERVICE_ROLE_KEY o limite não é aplicado."}`}
            >
              <Input id="skin_analysis_daily_limit" name="skin_analysis_daily_limit" inputMode="numeric" defaultValue={v.skin_analysis_daily_limit ?? 200} />
            </Field>
            <p className="text-xs leading-relaxed text-muted sm:col-span-2">
              Textos, botões, links e imagens do pop-up e da seção da home ficam em{" "}
              <Link href="/admin/conteudo#analise-de-pele" className="underline underline-offset-2">
                Conteúdo → Análise de pele
              </Link>
              . Os produtos sugeridos vêm das categorias de necessidade e de tipo de cada produto e do quadro “Análise de pele” na página do produto.
            </p>
          </div>
        </Card>

        <Card title="Entrega — regras gerais" description="Não anuncie cobertura, prazos ou frete grátis sem confirmação.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Resumo de entrega (página de produto)" htmlFor="delivery_summary" className="sm:col-span-2">
              <Input id="delivery_summary" name="delivery_summary" defaultValue={v.delivery_summary ?? ""} />
            </Field>
            <Checkbox name="pickup_enabled" label="Retirada disponível" defaultChecked={v.pickup_enabled ?? false} />
            <Field label="Detalhes da retirada" htmlFor="pickup_details">
              <Input id="pickup_details" name="pickup_details" defaultValue={v.pickup_details ?? ""} />
            </Field>
            <Checkbox name="free_shipping_enabled" label="Frete grátis por valor (informativo)" defaultChecked={v.free_shipping_enabled ?? false} />
            <Field label="Frete grátis a partir de (R$)" htmlFor="free_shipping_threshold">
              <Input id="free_shipping_threshold" name="free_shipping_threshold" inputMode="decimal" defaultValue={centsToInput(v.free_shipping_threshold_cents)} />
            </Field>
            <Field label="Pedido mínimo da loja (R$)" htmlFor="minimum_order" hint="Opcional. Bloqueia a finalização abaixo do valor.">
              <Input id="minimum_order" name="minimum_order" inputMode="decimal" defaultValue={centsToInput(v.minimum_order_cents)} />
            </Field>
          </div>
        </Card>

        <Card title="Textos da marca">
          <div className="grid gap-5">
            <Field label="Frase da loja (rodapé)" htmlFor="tagline">
              <Input id="tagline" name="tagline" defaultValue={v.tagline ?? ""} />
            </Field>
            <Field label="“Conheça a MIVORA” — título" htmlFor="about_headline" hint="Guardado, mas não aparece no layout atual da home (a página Sobre é editada em Páginas)">
              <Input id="about_headline" name="about_headline" defaultValue={v.about_headline ?? ""} />
            </Field>
            <Field label="“Conheça a MIVORA” — texto" htmlFor="about_text">
              <Textarea id="about_text" name="about_text" rows={4} defaultValue={v.about_text ?? ""} />
            </Field>
            <Field label="Nome da loja" htmlFor="store_name">
              <Input id="store_name" name="store_name" defaultValue={v.store_name ?? "MIVORA"} />
            </Field>
            <Field label="Título SEO padrão" htmlFor="seo_title">
              <Input id="seo_title" name="seo_title" defaultValue={v.seo_title ?? ""} maxLength={70} />
            </Field>
            <Field label="Descrição SEO padrão" htmlFor="seo_description">
              <Textarea id="seo_description" name="seo_description" rows={2} defaultValue={v.seo_description ?? ""} maxLength={170} />
            </Field>
          </div>
        </Card>

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-[#fafaf9]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <SubmitButton>Salvar configurações</SubmitButton>
        </div>
      </ActionForm>

      <h2 className="mb-3 mt-12 text-lg font-semibold">Opções de entrega</h2>
      <p className="mb-4 text-sm text-muted">
        Retirada, entrega local e outras opções da loja. Na calculadora de frete, cada opção aparece para os CEPs e cidades que ela atende, junto com as cotações das transportadoras. Valores são estimativas e podem ser ajustados no WhatsApp.
      </p>
      <div className="space-y-4">
        {(zones as Zone[] | null)?.map((z) => (
          <Card key={z.id} title={z.name} actions={<ActionButton action={deleteDeliveryZone.bind(null, z.id)} variant="danger" confirm="Remover esta opção de entrega?">Remover</ActionButton>}>
            <ZoneForm zone={z} />
          </Card>
        ))}
        <Card title="Nova opção de entrega">
          <ZoneForm />
        </Card>
      </div>
    </AdminPage>
  );
}

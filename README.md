# MIVORA — loja de skincare com finalização pelo WhatsApp

Loja virtual completa: vitrine pública, catálogo com busca e filtros, páginas de produto, carrinho, finalização pelo WhatsApp com registro do pedido e painel administrativo. Tudo usa o mesmo banco de dados.

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage, RLS) · Zod · React Hook Form · Vitest · Playwright.

---

## 1. Como funciona

| Área | Resumo |
|---|---|
| Loja | Home editorial, catálogo (`/produtos`), marcas, categorias e necessidades, novidades, mais vendidos, ofertas, kits, “Monte seu ritual”, favoritos (salvos no aparelho), páginas institucionais |
| Carrinho | Fica salvo no aparelho (localStorage) e é sincronizado entre abas. Preço e disponibilidade são conferidos de novo no banco ao abrir o carrinho |
| Finalização | `/finalizar` em duas etapas: **cadastro obrigatório** (nome, WhatsApp e e-mail, sem senha) e entrega/revisão. A função `create_order_intent` grava o pedido **com os preços lidos do banco**, ligado ao cadastro, e devolve o código `MIV-000001` → abre o `wa.me` com a mensagem pronta. Carrinhos grandes geram uma mensagem resumida com o código |
| Pedido ≠ venda | O pedido nasce como **Iniciado** e não mexe no estoque. No admin: **Confirmado** reserva o estoque, **Concluído** dá baixa definitiva, **Cancelado** libera a reserva ou estorna a baixa |
| Admin (`/admin`) | Painel, pedidos (com exportação CSV), produtos (com fotos e variantes), estoque e histórico, kits, marcas, categorias, conteúdo da home, FAQ, páginas, configurações e opções de entrega, sugestões de produtos e auditoria |

Quando um dado comercial ainda não foi preenchido, a loja se comporta de forma segura: produto sem preço aparece como “Consultar preço” e não entra no subtotal; sem número de WhatsApp os botões ficam ocultos; dados legais vazios não aparecem no site.

### Status comerciais (expansão do catálogo)
Cada produto tem **visibilidade** (rascunho/publicado/arquivado) e **disponibilidade** (disponível/em breve/esgotado). O painel mostra o resultado como um dos cinco status explícitos:

| Status | Visibilidade + disponibilidade | Na loja |
|---|---|---|
| Rascunho | rascunho | Invisível (só no painel) |
| Em breve | publicado + em breve | Vitrine com selo “Em breve”, **sem compra**; botão “Consultar previsão de chegada” (desligável em Configurações) |
| Disponível | publicado + disponível | Compra normal |
| Esgotado | publicado + esgotado | Visível, sem compra |
| Arquivado | arquivado | Fora da vitrine |

- **Trava de documentação (no banco):** um produto só pode ficar Disponível se a documentação e a regularização estiverem marcadas como **verificadas** em “Fornecedor e regularização”. Os 9 produtos do estoque inicial (“Estoque confirmado”) não são bloqueados, mas aparecem como “Documentação pendente” no painel.
- **Campos internos:** situação de compra (estoque confirmado/aquisição planejada/em avaliação), nº de notificação/registro, fornecedor, documento, lote, validade e notas. Nada disso é público.
- **Código público** (`MV0001`…): aparece na página do produto e em cada item da mensagem do WhatsApp.
- **Recomendações:** “Você também pode gostar” (começa pelos produtos relacionados escolhidos no painel), “Complete seu ritual”, “Mais produtos desta marca” e “Descubra outros cuidados”. Elas nunca combinam produtos com as tags `retinoide` e `esfoliante`, e os disponíveis vêm primeiro.
- **Importar/exportar catálogo:** `/admin/produtos/importar` (CSV por slug, com simulação, idempotente; células vazias não apagam nada).

### Oferta de boas-vindas e preços (12/10/2026)
- **Apresentação de entrada:** na primeira visita, uma tela animada com a logo dá as boas-vindas e oferece **10% OFF na primeira compra** (cupom `BEMVINDA10`). Ela aparece uma vez por aparelho e fecha com Esc, com o X ou com o botão.
- **Cupom:** fica salvo no aparelho e já vem aplicado na finalização. O desconto é **recalculado no banco**, apenas sobre os produtos com preço, e aparece na mensagem do WhatsApp e no pedido do painel. Se a cliente informar o telefone e ele já tiver um pedido confirmado, o cupom é recusado. Mesmo assim, confirme a primeira compra no atendimento.
- **Configurável** em Admin → Configurações → Oferta de boas-vindas (ativar/desativar, percentual e código).
- **Preços:** os produtos que aparecem no catálogo do fornecedor (`Seoul Beauty .pdf`) receberam o preço à vista do catálogo menos R$ 20 (migração `…008`, com a página de origem de cada preço comentada).

### Calculadora de frete (13/10/2026)
- **Onde aparece:** na página do produto, no carrinho e na finalização. A cliente digita o CEP (ele fica lembrado no aparelho) e vê a cidade e as opções de entrega com valor e prazo estimados.
- **Endereço pelo CEP:** consulta ao ViaCEP, com a BrasilAPI como segunda fonte. CEP inexistente é recusado. Se os dois serviços estiverem fora do ar, a calculadora segue com as opções que dependem só do CEP.
- **Opções da loja** (Configurações → Opções de entrega): retirada, entrega local etc., cada uma com taxa, prazo, frete grátis acima de um valor e pedido mínimo, e agora com **faixas de CEP** (`29000-000 a 29099-999` ou o prefixo `290`) e **cidades** (`Vitória/ES`) atendidas. Com as duas listas vazias, a opção vale para qualquer CEP.
- **Correios e transportadoras (Melhor Envio):** com `MELHOR_ENVIO_TOKEN` no servidor, o CEP de origem preenchido e a opção marcada em Configurações → Calculadora de frete, a loja cota PAC, SEDEX e transportadoras em tempo real, com o peso e as medidas de cada produto (cadastro do produto → Envio; em branco vale o padrão da loja). Dá para somar dias de preparação, um acréscimo percentual e um valor fixo por envio. O painel faz uma cotação de teste e avisa se o token for recusado (por exemplo, por ter expirado).
- **Sempre há uma saída:** quando nenhuma opção atende o CEP, aparece “Combinar a entrega pelo WhatsApp”.
- **Segurança:** o navegador envia só o CEP e a opção escolhida. Ao finalizar, o servidor **refaz a cotação** com os preços do banco, e a função `create_order_intent` confere o formato do CEP e se a zona atende o destino. CEP, cidade, serviço e prazo ficam no pedido (painel e CSV) e vão na mensagem do WhatsApp, sempre como **estimativa** confirmada no atendimento.
- O token do Melhor Envio fica **só na variável de ambiente**, porque as configurações da loja são públicas (RLS). Há limite de 20 cotações por minuto por IP e cache de 10 minutos para cotações iguais.

### Visual premium (13/10/2026)
Reprodução do mockup enviado pela dona da loja, sem trocar a stack nem apagar dados:

- **Tipografia e cores:** Inter em todo o site (texto 400, destaques 500/600, títulos 600), texto `#121212` sobre branco, rosé e bege nas faixas de campanha, cards com borda discreta.
- **Cabeçalho:** barra preta fina com mensagens (Configurações → Barra superior; a oferta de boas-vindas entra sozinha), logo à esquerda, busca central com sugestões, conta, favoritos e carrinho, e menu compacto (Início, Todos os produtos, Marcas, Cuidados com a pele, Novidades, Contato). No celular: menu lateral, busca, conta e carrinho.
- **Home, na ordem do mockup:** banner principal em carrossel → Novidades MIVORA → Descubra por marca → Rotinas de Skincare → Cuidados para cada necessidade → Em breve na MIVORA → depoimentos → rodapé.
  - **Banners** (Admin → Banners e home): principal, rotinas, em breve e vitrines extras, com título, subtítulo, botões, foto desktop/celular, **cor de fundo**, **produto em destaque** (para banners sem foto), **período da campanha** e **layout**: “foto ao lado do texto” ou “arte completa” (imagem 16:9 que já traz logo e textos, mostrada inteira e clicável; no celular o texto do banner aparece abaixo da imagem). Sem foto, o banner usa fotos reais dos produtos.
  - **Carrossel atual:** o banner do sérum PDRN (fundo rosé) e as quatro artes autorais da MIVORA (sérum, creme, gel e máscara), que substituíram as fotos de campanha.
  - **Necessidades:** categorias com “Mostrar na home” (Admin → Categorias). Sem imagem própria, cada quadro usa a foto de um produto diferente da categoria.
  - **Marcas:** as cinco primeiras marcas com produtos, pela ordem de Admin → Marcas. Sem imagem da marca, usa a foto de um produto. O nome aparece no tipo do site, nunca como logotipo imitado.
  - **Em breve:** aparece quando há produtos “Em breve” publicados (o botão abre a lista) ou, sem eles, quando o WhatsApp está configurado (o botão pergunta dos próximos lançamentos). Pode ser desativado no painel.
  - **Depoimentos** (Admin → Depoimentos): só aparecem depoimentos reais, e para publicar é obrigatório confirmar a autorização da cliente. Sem depoimentos publicados, a seção some e, com o WhatsApp configurado, entra um bloco institucional de atendimento no lugar. Nada de prova social inventada.
- **Rodapé:** faixa escura (logo, redes configuradas, newsletter, frase da loja) e colunas de links.
- **Newsletter:** e-mail e data da inscrição gravados pela função `subscribe_newsletter` (consentimento, validação, limite por minuto, mesma resposta para e-mail novo ou repetido). Lista, exclusão e CSV em Admin → Newsletter. A política de privacidade ganhou um parágrafo sobre isso.
- **Produto:** galeria com miniaturas, compra à direita (preço real, estoque, frete pelo CEP, entrega/pagamento) e abas Descrição, Benefícios, Ingredientes, Como usar e Perguntas frequentes, só com dados do cadastro.
- **Carrinho:** “Seu carrinho (N itens)”, lista com quantidade e remoção, resumo com frete pelo CEP e finalização pelo WhatsApp.
- **Minha conta:** a loja não tem cadastro de cliente. A página mostra os pedidos enviados deste aparelho (código e link da conversa, guardados só no navegador) e os favoritos.
- **Painel:** barra lateral escura, área clara, e os formulários não perdem mais o que foi digitado quando o servidor recusa um envio.
- **Fotos:** a home usa as fotos de campanha enviadas e fotos reais dos produtos. Três fotos de produto com fundo cinza de estúdio ganharam fundo branco (originais em `assets/originals/products/`).

### Cadastro obrigatório e captação de leads (13/10/2026)
- **Para comprar, a cliente se cadastra:** nome completo, WhatsApp com DDD e e-mail, sem senha. O cadastro é feito na primeira etapa de `/finalizar` (ou em Minha conta, sem precisar comprar) e fica lembrado no aparelho para as próximas compras, com “Alterar dados” e “Sair deste aparelho”.
- O botão “Comprar pelo WhatsApp” da página de produto agora passa pelo carrinho e pelo cadastro. As consultas (preço, disponibilidade, previsão) continuam indo direto para o WhatsApp.
- **No banco:** tabela `customers` (só o admin lê), gravada pelas funções `register_customer` e `create_order_intent`, que **exige** o cadastro e liga o pedido a ele (`order_intents.customer_id`). O cadastro é atualizado pelo e-mail; o destino da entrega completa cidade/UF/CEP; há contagem de pedidos e limite de cadastros por minuto.
- **Marketing só com consentimento:** a caixa “Quero receber novidades…” é opcional e vem desmarcada. Quem marca entra também na lista da newsletter (origem “cadastro”). Desmarcar depois revoga o consentimento.
- **Painel → Clientes:** busca por nome, e-mail ou WhatsApp, consentimento, pedidos, cidade, exportação CSV e exclusão a pedido da cliente (os pedidos continuam, sem vínculo). O pedido mostra o e-mail do cadastro, e o painel inicial conta os clientes.
- A política de privacidade e a pergunta “Preciso criar uma conta?” foram atualizadas.

### Pagamento pelo site — Mercado Pago (14/10/2026)
- **Como funciona:** desde 15/10/2026 a cliente paga dentro da finalização em 4 etapas (veja abaixo): **Pix** (QR Code e código copia e cola na página do pedido), **cartão de crédito** (campos seguros do Mercado Pago, o *Card Payment Brick*), **boleto ou saldo no Mercado Pago** (pelo Checkout Pro) ou **Combinar pelo WhatsApp**. O pedido é registrado com o total calculado pelo banco (produtos − cupom + frete). A página `/pedido/[id]` mostra a situação do pagamento, oferece “Pagar agora” ou “Tentar pagar novamente” e se atualiza sozinha enquanto um Pix é confirmado.
- **Quando aparece:** com a opção ligada em Configurações → Pagamento pelo site **e** com as credenciais no servidor. Pedidos com item “Sob consulta” ou entrega “a combinar” só podem ser finalizados pelo WhatsApp, porque o total precisa estar definido.
- **Confirmação automática:** o Mercado Pago avisa o site em `/api/mercadopago/webhook`. O site **nunca confia no aviso**: relê o pagamento na API do Mercado Pago com o token da loja e grava pela função `apply_payment_update`, que só o servidor executa (service role). Pagamento aprovado com o valor total confirma o pedido e reserva o estoque. Uma tentativa recusada depois de um pagamento aprovado não desfaz nada. Valor menor, estoque esgotado no meio do caminho, devolução e contestação ficam registrados no histórico do pedido para a equipe decidir. A página do pedido e o botão “Consultar no Mercado Pago” do painel também conferem o pagamento, caso um aviso se perca.
- **Avisos assinados:** com `MERCADOPAGO_WEBHOOK_SECRET`, avisos com assinatura (`x-signature`) inválida são recusados.
- **Painel:** card “Pagamento online” no pedido (situação, forma, valor pago, ID no Mercado Pago), aviso “Pago · online” na lista e colunas de pagamento no CSV. Em Configurações, o card mostra se a credencial, a chave de serviço e a chave do webhook estão configuradas e testa a conexão com o Mercado Pago.
- **Dados:** a loja não recebe dados de cartão: o navegador envia o cartão direto ao Mercado Pago, que devolve um token de uso único. Para o pagamento e a prevenção a fraudes, vão para o Mercado Pago o nome, o e-mail, o CPF, o telefone e o endereço de entrega, além dos itens. A política de privacidade ganhou as seções “Pagamentos online” e “Conta, CPF e endereço”.
- **Aplicação no Mercado Pago:** “MIVORA Loja Online” (Checkout Pro). O webhook de produção já está cadastrado com o evento Pagamentos.

### Apple Pay — Mercado Pago (14/10/2026, desligado até a liberação)
- **Como funciona:** em iPhone, iPad ou Mac com Safari e Apple Pay configurado, a finalização mostra a opção **Apple Pay** (cartões de crédito Visa e Mastercard, à vista). O CPF, exigido pelo Mercado Pago para esse pagamento, vem da etapa de identificação, e a cliente toca no botão oficial na revisão do pedido. Em outros aparelhos a opção não aparece.
- **Fluxo:** ao abrir a janela da Apple, o servidor registra o pedido (preços e frete do banco) e o Mercado Pago valida a sessão com o certificado da loja (`/applepay/v1/session`). A janela passa a mostrar o total exato do servidor. Autorizado com Face ID/Touch ID, o token da Apple vira um token de cartão no Mercado Pago (`/platforms/pci/applepay/v1/tokenize`) e o servidor cria a cobrança pela **Orders API** (`/v1/orders`) com o valor registrado no banco. Aprovado, o pedido é confirmado e o estoque reservado, como nos demais pagamentos online. Se o cartão for recusado, a cliente tenta de novo sem criar outro pedido.
- **Avisos posteriores** (devolução, contestação) chegam pelo webhook com o evento **Order** e são relidos na API (`/v1/orders/{id}`).
- **Configuração (Painel → Configurações → Apple Pay):** Merchant ID, Public Key, ID do certificado, Product ID e o conteúdo do arquivo de verificação de domínio, publicado em `/.well-known/apple-developer-merchantid-domain-association.txt`. São identificadores públicos; o Access Token continua só no servidor. A Public Key tem formato conferido, para impedir que o Access Token seja colado no campo por engano.
- **Requisitos para ligar:** habilitação pelo time comercial do Mercado Pago; conta Apple Developer com o Merchant ID e o domínio verificados (o domínio com e sem `www`, se os dois forem usados); certificados de comerciante e de processamento gerados pela API do Mercado Pago e assinados no portal da Apple; o evento **Order (Mercado Pago)** marcado no webhook da aplicação.

### Finalização em 4 etapas e login com Google e Apple (15/10/2026)
- **Etapas:** 1 Sacola (`/carrinho`) → 2 Identificação e entrega → 3 Pagamento → 4 Revisão, em `/finalizar?etapa=…`, com indicador de progresso. O voltar do navegador funciona e uma etapa aberta por link só aparece com as anteriores completas.
- **Seus dados:** e-mail, primeiro nome, sobrenome, CPF (dígitos conferidos) e telefone, com máscaras e mensagens ao lado de cada campo. Compra como visitante continua possível.
- **Entrega:** o CEP preenche rua, bairro, cidade e estado; a cliente informa número, complemento, referência e quem recebe. As opções e os valores vêm da cotação real (zonas do painel e Melhor Envio). Sem opção com valor definido, só “Combinar pelo WhatsApp” fica disponível.
- **Rascunho:** os dados ficam na aba do navegador (`sessionStorage`) e sobrevivem a recarregar a página e à ida ao Google/Apple. Dados de cartão nunca são guardados: depois de recarregar, o cartão é digitado de novo.
- **Sem pedido duplicado:** cada tentativa leva um identificador. Clique duplo, nova tentativa após erro de rede ou cartão recusado reaproveitam o mesmo pedido (índice único no banco e chaves de idempotência no Mercado Pago).
- **Login com Google e Apple:** pelo Supabase Auth (OAuth com PKCE, `/auth/callback`). Os botões só aparecem para provedores ativados no Supabase. A conta traz nome e e-mail; a finalização pede só o que falta e salva os dados na conta. A Apple manda o nome apenas na primeira autorização e pode usar um e-mail privado de encaminhamento: os dois casos são tratados. Dados já salvos só aparecem para a conta que os salvou, com e-mail verificado, e nunca são associados só porque alguém digitou o mesmo e-mail.
- **Conta:** endereços salvos (até 10, um principal) e pedidos feitos com a conta aparecem em Minha conta e na finalização. Se a sessão expirar no meio da compra, a cliente é avisada e continua como visitante sem perder o que digitou.
- **Painel:** o pedido mostra o endereço completo, o CPF e se foi feito com conta; o CSV ganhou essas colunas.

### Análise de Pele com IA (16/10/2026)
- **Onde aparece:** pop-up de lançamento ao entrar no site (não durante a compra, nunca junto com a apresentação de boas-vindas, no máximo uma vez por sessão e de novo só depois do intervalo definido em Configurações, padrão 7 dias); seção fixa na home logo abaixo do banner principal; item “Análise de pele” no menu; página `/analise-de-pele`.
- **Fluxo:** início → consentimento (caixa não marcada, a cada análise) → foto (câmera ou galeria, pré-visualização com moldura, trocar ou cancelar) → análise (as mensagens mostram as etapas reais que o servidor envia) → resultado → produtos → rotina da manhã e da noite. O resultado em texto fica só na aba do navegador; salvar na conta é opcional, com consentimento à parte (só o texto, até 12 meses, excluível em Minha conta).
- **IA:** Claude Opus 5.5 (Anthropic), chamado apenas pelo servidor com `ANTHROPIC_API_KEY`, com saída estruturada validada no servidor e reenvio automático para o modelo recomendado pela Anthropic se o pedido for recusado (`fallbacks: "default"`). A IA descreve só características cosméticas visíveis, indica quando a foto não permite avaliar, não faz diagnóstico, não fala de identidade, idade ou saúde e não cita produtos. Sem a chave, nada da função aparece para as clientes e a página informa que está indisponível; nenhum resultado é simulado.
- **Foto:** reduzida e sem metadados já no aparelho; no servidor é conferida (formato, tamanho, resolução), recodificada em memória e enviada à IA. Nunca é gravada em disco, Storage ou banco, nem registrada em log.
- **Recomendações:** só produtos reais, publicados, disponíveis e com preço. As necessidades vêm das categorias de necessidade de cada produto e a etapa da rotina vem do tipo de produto; benefícios, modo de uso e avisos vêm do cadastro. Retinoides e esfoliantes (tags `retinoide`/`esfoliante`) ficam à noite e nunca juntos. Em cada produto do painel, o quadro “Análise de pele” permite tirar o produto das sugestões, trocar etapa ou horário, cadastrar precauções e escolher uma alternativa para quando estiver indisponível. A cliente pode ajustar as necessidades no resultado (sem nova foto) e adicionar um produto ou a rotina inteira ao carrinho, depois de ver a lista e o total.
- **Painel:** Configurações → “Análise de Pele com IA” (ligar/desligar, intervalo do pop-up, limite de análises por dia, situação da chave e uso do dia). Conteúdo → “Análise de pele — pop-up de lançamento” e “— seção da home” (textos, destaques, botões, links, imagem, cor e datas).
- **Custo:** cada análise é cobrada pela Anthropic (estimativa de US$ 0,05 a 0,10 com o Claude Opus 5.5). O limite diário protege contra uso excessivo; há também limite por IP.

## 2. Estrutura

```
supabase/migrations/      esquema, RLS, funções (RPC), storage e catálogo inicial (versionados)
src/app/(store)/          páginas públicas
src/app/admin/            painel (login + (panel)/…)
src/app/api/              busca com sugestões e exportação CSV
src/lib/catalog/          leituras públicas com cache ('use cache' + cacheTag)
src/lib/admin/            autenticação, schemas e Server Actions do admin
src/lib/store/actions.ts  carrinho e finalização (Server Actions)
src/lib/whatsapp.ts       montagem da mensagem e do link
src/components/store/home/ seções da home (banner, benefícios, marcas, campanhas, necessidades, depoimentos)
src/lib/shipping/         calculadora de frete: CEP, zonas por CEP/cidade e cotação no Melhor Envio (servidor)
src/proxy.ts              renova a sessão do admin (o antigo middleware)
public/products/          fotos enviadas (WebP otimizado); originais em assets/originals/
scripts/local-stack/      stack local compatível com Supabase (só para desenvolvimento e testes)
tests/                    unit (Vitest), db (PGlite: RLS/RPC/estoque), e2e (Playwright)
```

## 3. Colocar no ar

### 3.1 Supabase
1. Crie um projeto em <https://supabase.com> (região São Paulo recomendada).
2. Aplique as migrações. Pela CLI: `npx supabase link --project-ref <ref>` e depois `npx supabase db push`. Ou cole cada arquivo de `supabase/migrations/` no **SQL Editor**, na ordem.
3. Em **Authentication → Providers**, mantenha só e-mail/senha e **desative o cadastro público** (“Allow new users to sign up”). O painel não depende de cadastro aberto.

### 3.2 Primeiro administrador
1. **Authentication → Users → Add user**: crie o usuário com e-mail e senha forte.
2. No **SQL Editor**, rode:
   ```sql
   select public.grant_admin_by_email('voce@seudominio.com.br', 'owner');
   ```
   Essa função não pode ser chamada pelo navegador, só pelo SQL Editor ou com a service role.
3. Entre em `/admin/login`.

### 3.3 Vercel
1. Importe o repositório na Vercel (o framework Next.js é detectado sozinho).
2. Variáveis de ambiente (veja `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. Opcionais, para cotar Correios e transportadoras: `MELHOR_ENVIO_TOKEN` (gerado em <https://melhorenvio.com.br/painel/gerenciar/tokens>, botão “Novo token”), `MELHOR_ENVIO_EMAIL` (se vazio, usa o e-mail de contato da loja) e `MELHOR_ENVIO_SANDBOX=true` para o ambiente de testes. Para o pagamento pelo site: `MERCADOPAGO_ACCESS_TOKEN` (Access Token de produção da aplicação no Mercado Pago), `MERCADOPAGO_WEBHOOK_SECRET` (Suas integrações → aplicação → Webhooks → assinatura secreta) e `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → `service_role`/secret). As três ficam **só no servidor**, nunca com o prefixo `NEXT_PUBLIC_`. Depois de mudar uma variável, faça um novo deploy.
3. Faça o deploy. **O banco precisa estar acessível durante o build**, porque as páginas públicas são pré-renderizadas com os dados reais.
4. **Domínio:** em Project → Domains, adicione o domínio e configure o DNS indicado. Atualize `NEXT_PUBLIC_SITE_URL` e faça um novo deploy.

### 3.4 Backup e recuperação
- Planos pagos do Supabase têm backup diário. Para recuperação em um ponto específico, ative o PITR.
- Em qualquer plano, para um backup lógico periódico: `npx supabase db dump --data-only -f backup.sql` (guarde fora do projeto). Para restaurar: aplique as migrações e depois o dump.
- As fotos ficam no bucket `product-media`, que pode ser copiado pela API do Storage.

## 4. Segurança
- **RLS em todas as tabelas.** Visitantes só leem dados publicados. Custo de aquisição, SKU, código de barras e notas internas ficam em `product_private`, que só o admin lê.
- Pedidos, estoque e auditoria **não aceitam escrita direta**: tudo passa por funções `SECURITY DEFINER` que validam permissões e dados (preços sempre do banco, quantidades de 1 a 99, estoque, limite de pedidos por minuto).
- Toda Server Action e rota do admin confere de novo a sessão e o papel em `admin_users`. Esconder botões nunca é a única barreira.
- **Pagamentos:** a chave de serviço do Supabase é usada só no servidor, para gravar resultados de pagamento já confirmados na API do Mercado Pago. Visitantes leem um recibo do pedido (`get_order_receipt`, pelo ID aleatório do pedido) sem telefone, e-mail, CEP ou observações.
- Uploads: confere o tipo real pelos primeiros bytes do arquivo, limita o tamanho, recodifica com `sharp` (o que remove metadados e conteúdo embutido) e o bucket só aceita escrita de admins.
- Auditoria automática por gatilhos (quem, o quê, quais campos) em `/admin/auditoria`.
- CSV protegido contra injeção de fórmulas; JSON-LD escapado; Markdown das páginas renderizado sem HTML bruto.

## 5. Desenvolvimento e testes

```bash
npm install
npm run dev            # precisa de .env.local apontando para um Supabase
npm test               # Vitest: unidade + banco (PGlite, sem dependências externas)
npm run lint
npm run build
```

**Stack local (opcional, sem conta no Supabase).** Requer os binários do PostgreSQL (`initdb`, `pg_ctl`, `psql`) e do [PostgREST](https://github.com/PostgREST/postgrest/releases):

```bash
PG_BIN=/caminho/pgsql/bin POSTGREST_BIN=/caminho/postgrest npm run stack:reset   # terminal 1
npm run build && npm start                                                         # terminal 2
npm run test:e2e                                                                   # testes de aceitação no navegador
# ou, tudo de uma vez (recria o banco local, faz o build e roda a suíte):
npm run test:e2e:fresh
```

O script gera o `.env.local` e cria o admin `admin@mivora.local` / `mivora-local-123`. Ele emula apenas o login por senha e o Storage: **não use em produção**. Para os testes de frete, ele também simula o ViaCEP e o Melhor Envio (CEPs `29055-100`, `29100-010` e `01001-000`), e o `test:e2e:fresh` se recusa a rodar se as cotações apontarem para o serviço real.

## 6. Pendências antes do lançamento

### Expansão do catálogo (produtos 10–29)
- Os 20 novos produtos estão em **rascunho + Em breve**, sem preço, estoque nem fotos. Para mostrá-los como vitrine, publique cada um (visibilidade “Publicado”) mantendo “Em breve”.
- **Fotos:** nenhuma imagem dos 20 novos foi incluída, porque não há autorização de uso confirmada. Envie fotos licenciadas pelo painel.
- **Conteúdo técnico (10–21):** textos escritos a partir dos nomes oficiais e de ativos amplamente divulgados, todos marcados “a revisar”. Confira volume, ativos e modo de uso na embalagem antes de publicar.
- **Produtos 22–29:** só nome, marca e categoria. Confirme a versão e a apresentação no catálogo oficial antes de preencher. Há observações internas nos que têm várias versões (Laneige Lip Sleeping Mask, TIRTIR Milk Skin Toner e outros).
- **Liberar a venda:** registre a documentação/regularização, defina o preço e mude para Disponível.
- **Nomes dos 9 originais:** atualizados para os nomes comerciais oficiais da nova lista. Slugs, preços, estoque e fotos foram mantidos. A URL antiga `/categorias/discos-faciais` redireciona para `/categorias/tonicos-e-discos`.

### Configuração geral
O checklist também aparece no painel (`/admin`, card “Preparação para o lançamento”):

1. **WhatsApp da loja:** Configurações.
2. **Preços** dos 9 produtos (hoje “Consultar preço”).
3. **Estoque:** registrar entradas em Estoque, se quiser controle numérico. Sem isso, os produtos ficam “Em estoque” sem quantidade.
4. **Fotos oficiais pendentes:** Medicube PDRN Pink Peptide Sérum, Medicube Zero Pore Pad e Celimax The Vita A Retinal Shot (aparecem com placeholder).
5. **Conferir a foto do Numbuzin No.9:** a embalagem enviada mostra “No.9 NAD+ Retinol” em aplicador tipo seringa. Confirmar se é o mesmo produto que o “Creme Volumetox para Olhos”.
6. **Revisar o conteúdo técnico** (ativos, volume, modo de uso) de cada produto com a embalagem e marcar “Conteúdo técnico revisado”.
7. **Dados legais:** razão social, CNPJ, endereço e e-mail em Configurações.
8. **Páginas institucionais:** revisar privacidade, termos, envio e trocas com a assessoria e desmarcar “pendente de revisão”.
9. **Entrega e frete:** informar o CEP de origem e criar as opções reais (faixas de CEP ou cidades, taxa, prazo) em Configurações. Para cotar Correios e transportadoras, gerar o token no Melhor Envio e cadastrar `MELHOR_ENVIO_TOKEN` na Vercel/Hostinger. Revisar as políticas de envio e de privacidade, que ganharam um parágrafo sobre a calculadora.
10. **Domínio** e `NEXT_PUBLIC_SITE_URL`.
10. **Análise de Pele com IA:** criar uma chave em console.anthropic.com (API Keys, com créditos ou forma de pagamento na conta), cadastrar `ANTHROPIC_API_KEY` nas variáveis do servidor (Vercel e Hostinger) e fazer um novo deploy. Opcional: enviar fotos editoriais licenciadas para o pop-up e para a seção em Conteúdo (sem elas, aparece a foto do produto em destaque) e revisar o quadro “Análise de pele” dos produtos.
10. **Login com Google e Apple:** no Supabase → Authentication → Providers, ative Google (ID e chave secreta do cliente OAuth criado no Google Cloud, com o redirecionamento `https://iknqowwmxtaqmwqjzhsr.supabase.co/auth/v1/callback`) e Apple (Services ID, Team ID, Key ID e a chave .p8; a chave secreta gerada vence a cada 6 meses). Em Authentication → URL Configuration, cadastre `https://mivoracosmeticos.com.br/auth/callback` (e a versão com `www`) nas Redirect URLs. Sem isso, os botões não aparecem.
10. **Cartão e Pix no site:** a Public Key de produção do Mercado Pago em Configurações (sem ela, o cartão não aparece) e uma chave Pix cadastrada na conta do Mercado Pago (sem ela, o Mercado Pago recusa o Pix).
10. **Apple Pay:** pedir a habilitação ao Mercado Pago (e o Product ID), criar a conta Apple Developer e o Merchant ID, verificar o domínio, gerar os certificados, marcar o evento Order no webhook e preencher o card Apple Pay em Configurações.
10. **Pagamento pelo site:** ativar as credenciais de produção da aplicação “MIVORA Loja Online” no Mercado Pago, cadastrar `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` na Vercel, fazer um novo deploy e ligar a opção em Configurações. Revisar a pergunta frequente sobre formas de pagamento e a política de trocas (estorno pelo Mercado Pago). Com vendas online, os dados legais (razão social, CNPJ, endereço) passam a ser essenciais.
11. **Fotos editoriais da home:** para chegar ao nível do mockup, envie fotos licenciadas para o banner principal (horizontal, com espaço livre à esquerda, ou vertical com o produto no centro), “Rotinas de Skincare”, “Em breve”, cada necessidade e cada marca. Hoje essas áreas usam as fotos de campanha enviadas e fotos dos produtos.
12. **Barra superior:** só troque a mensagem de frete para “Enviamos para todo o Brasil” depois de confirmar a cobertura (Configurações → Barra superior e newsletter).
13. **Redes sociais:** preencha Instagram/TikTok/Facebook em Configurações para o “Siga a gente” do rodapé.
11. **Símbolo ®:** fica desligado; só ative em Configurações se o registro da marca estiver confirmado.
12. **Analytics e Meta Pixel:** não instalados. Se forem adicionados, incluir aviso de consentimento e atualizar a política de privacidade.

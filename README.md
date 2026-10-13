# MIVORA — loja de skincare com finalização pelo WhatsApp

Loja virtual completa: vitrine pública, catálogo com busca e filtros, páginas de produto, carrinho, finalização pelo WhatsApp com registro do pedido e painel administrativo. Tudo usa o mesmo banco de dados.

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage, RLS) · Zod · React Hook Form · Vitest · Playwright.

---

## 1. Como funciona

| Área | Resumo |
|---|---|
| Loja | Home editorial, catálogo (`/produtos`), marcas, categorias e necessidades, novidades, mais vendidos, ofertas, kits, “Monte seu ritual”, favoritos (salvos no aparelho), páginas institucionais |
| Carrinho | Fica salvo no aparelho (localStorage) e é sincronizado entre abas. Preço e disponibilidade são conferidos de novo no banco ao abrir o carrinho |
| Finalização | `/finalizar` → a função `create_order_intent` grava o pedido **com os preços lidos do banco** e devolve o código `MIV-000001` → abre o `wa.me` com a mensagem pronta. Carrinhos grandes geram uma mensagem resumida com o código |
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
- **Home, na ordem do mockup:** banner principal em carrossel → faixa de benefícios → Novidades MIVORA → Descubra por marca → Rotinas de Skincare → Cuidados para cada necessidade → Em breve na MIVORA → depoimentos → rodapé.
  - **Banners** (Admin → Banners e home): principal, rotinas, em breve e vitrines extras, com título, subtítulo, botões, foto desktop/celular, **cor de fundo**, **produto em destaque** (para banners sem foto) e **período da campanha**. Sem foto, o banner usa fotos reais dos produtos.
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
2. Variáveis de ambiente (veja `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. Opcionais, para cotar Correios e transportadoras: `MELHOR_ENVIO_TOKEN` (gerado em <https://melhorenvio.com.br/painel/gerenciar/tokens>, botão “Novo token”), `MELHOR_ENVIO_EMAIL` (se vazio, usa o e-mail de contato da loja) e `MELHOR_ENVIO_SANDBOX=true` para o ambiente de testes. Depois de mudar uma variável, faça um novo deploy.
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
11. **Fotos editoriais da home:** para chegar ao nível do mockup, envie fotos licenciadas para o banner principal (horizontal, com espaço livre à esquerda, ou vertical com o produto no centro), “Rotinas de Skincare”, “Em breve”, cada necessidade e cada marca. Hoje essas áreas usam as fotos de campanha enviadas e fotos dos produtos.
12. **Textos de confiança:** confirme que pode afirmar “Produtos originais — qualidade e procedência” (notas e fornecedores) e só troque a barra superior para “Enviamos para todo o Brasil” depois de confirmar a cobertura (Configurações → Barra superior e benefícios).
13. **Redes sociais:** preencha Instagram/TikTok/Facebook em Configurações para o “Siga a gente” do rodapé.
11. **Símbolo ®:** fica desligado; só ative em Configurações se o registro da marca estiver confirmado.
12. **Analytics e Meta Pixel:** não instalados. Se forem adicionados, incluir aviso de consentimento e atualizar a política de privacidade.

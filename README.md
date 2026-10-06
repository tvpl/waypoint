# Waypoint — Visual Planner & Link Library

O lugar onde você organiza e encontra as coisas.

Waypoint tem dois módulos que compartilham workspace, tags, busca e compartilhamento:

- **Visual Planner** — um canvas para desenhar soluções macro (blocos, containers, notas, cartões de link, seções, imagens e conexões). Cada plan tem um **modo edição** com ferramentas e um **modo visualização** limpo, que parece uma página pronta. Rascunhos são salvos automaticamente; a publicação gera versões imutáveis que podem ser compartilhadas sem que edições em andamento quebrem o que outras pessoas veem.
- **Link Library** — um substituto completo para os favoritos do navegador: coleções aninhadas, tags, capas, descrições, três modos de visualização (cards, compacto e lista), filtros, preview interno ou nova aba, e importação/exportação no formato de favoritos dos navegadores.

Além do essencial, o Planner tem **layout automático** (vertical ou horizontal, também só para a seleção), **modo apresentação** (passo a passo por seções, em tela cheia, com teclado ou gesto no celular; `?present=1` abre direto) e **comentários** por plan ou por bloco, com respostas, @menções e resolução. Um plan novo pode partir de **modelos prontos** (roadmap, arquitetura, quadro de status, registro de decisão, retrospectiva); colar ou soltar uma URL no canvas cria um cartão de link já com título, descrição e capa; há **guias de alinhamento** ao arrastar (Alt desliga), **minimapa** (M) e o canvas reabre onde você parou. A Link Library verifica **links quebrados** e redirecionamentos, e uma **extensão de navegador** salva a página atual direto numa coleção.

**Camadas e desenho.** Um plan pode ter várias **camadas** empilhadas: a base (o que existe hoje) e, por cima, fluxos alternativos, versões, complementos ou anotações. Cada camada pode ser:

- ocultada (`⌥` + clique no olho mostra só ela);
- travada, para desenhar por cima sem mexer na base;
- mais ou menos transparente (opacidade de 10% a 100%), para servir de contexto;
- animada, com tracejado correndo nas conexões para mostrar o sentido do fluxo;
- revelada na apresentação: começa oculta e aparece num passo próprio, antes dos seus elementos;
- comentada: a conversa fica presa à camada, e o painel de comentários filtra por camada;
- reordenada ou excluída (mantendo ou não os elementos).

Para começar rápido há **modelos de camadas** com visões prontas: "Atual, proposta e riscos", "Fluxo principal e exceções", "Versões v1 → v3" e "Essencial, complementos e notas".

Elementos novos, conexões e desenhos entram na **camada ativa**, e uma conexão pode ligar blocos de camadas diferentes: assim se desenha um fluxo novo sobre a arquitetura atual. A barra de ferramentas segue a do Excalidraw: **retângulo** (`R`), **losango** (`D`), **elipse** (`O`), **seta** (`A`), **linha** (`L`), **lápis** (`P`), **texto** (`T`), **quadro** (`F`) e **borracha** (`E`), também pelos números `1`…`0`. Formas têm traço, preenchimento (sólido, hachura, cruzado ou pontilhado), espessura, tracejado, cantos e opacidade; o estilo é limpo por padrão e pode ser **desenhado à mão** por elemento ou por camada. Uma seta solta sobre uma forma fica **presa** a ela e acompanha quando a forma se move, com pontas, rota reta, curva ou em cotovelo. Um **quadro** agrupa o que é desenhado dentro dele. Os traços nunca bloqueiam cliques nos elementos de baixo. Conexões podem ter **passos numerados** (1, 2, 3…): "Numerar passos do fluxo" (menu da conexão) numera as conexões selecionadas, ou as da camada, na ordem do fluxo.

**Visões** guardam combinações de camadas visíveis (ex.: "Hoje", "Com a proposta"). Quem lê o plan publicado alterna camadas e visões no botão **Camadas**, só para si. `?view=<id>` abre o link (ou a apresentação) direto numa visão. **Comparar visões** mostra duas visões lado a lado (A, B ou a diferença): o que entrou, o que saiu e o que mudou (mesmo título redesenhado em outra camada), com link compartilhável (`?compare=v:<a>,v:<b>`). No menu de exportação, **Exportar visão** gera PNG, SVG ou PDF de uma visão sem mexer no que está na tela.

Qualquer bloco de um plan pode apontar para um **Resource**: uma URL, outro plan, um favorito, uma coleção, um arquivo ou uma página interna. É isso que transforma o desenho em uma porta de entrada para todo o contexto de um projeto.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Radix UI · lucide · React Flow (`@xyflow/react`) · SQLite (`better-sqlite3`) com FTS5 · Drizzle ORM · Zod.

## Rodando localmente

Requer Node.js 22 ou superior.

```bash
npm install
npm run db:seed   # opcional: cria demo@waypoint.local / waypoint123 com dados de exemplo
npm run dev       # http://localhost:3000
```

O banco fica em `data/waypoint.db` (configurável com `DATABASE_PATH`). As migrações rodam automaticamente na primeira conexão. Os uploads ficam em `data/uploads` (configurável com `UPLOADS_DIR`).

| Script | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run typecheck` | checagem de tipos |
| `npm test` | testes unitários (Vitest) |
| `npm run db:generate` | gera uma migração a partir de `src/server/db/schema.ts` |
| `npm run db:seed` | dados de demonstração |

## Aplicativo de desktop

O Waypoint também roda como aplicativo, fora do navegador, no Windows, no macOS e no Linux (`desktop/`, com Electron). O app traz o próprio servidor e o banco SQLite e funciona offline, sem login: na primeira abertura ele cria a sua conta local.

| Sistema | Arquivo | Observação |
| --- | --- | --- |
| Windows | `Waypoint-x.y.z-portatil.exe` | roda sem instalar; os dados ficam em `WaypointData\` ao lado do `.exe` (dá para levar num pendrive) |
| Windows | `Waypoint-x.y.z-instalador.exe` | instalação normal; dados em `%APPDATA%\Waypoint\data` |
| macOS | `Waypoint-x.y.z-mac-arm64.dmg` / `-x64.dmg` | sem notarização: na primeira vez, Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim (ou `xattr -dr com.apple.quarantine /Applications/Waypoint.app`). Gerado no próprio Mac com `npm run desktop:dist`, o app abre direto |
| Linux | `Waypoint-x.y.z-linux-x86_64.AppImage` | dados em `~/.config/Waypoint/data` |

**Modo portátil** em qualquer sistema: crie uma pasta `WaypointData` ao lado do aplicativo (ou do `.AppImage`/`Waypoint.app`). Banco, uploads, backups e o perfil da janela (tema, posição do canvas) passam a ficar nela.

Destaques:

- **Barra de título própria**, nas cores do tema. Nela ficam o menu com ícones e atalhos (Arquivo, Editar, Exibir, Ir, Janela, Ajuda), voltar/avançar e a busca. À direita ficam captura rápida, status do backup, cadeado e tema. No macOS o menu fica na barra do sistema. `Alt` sozinho leva o foco ao menu. Na tela inicial, três atalhos mostram o estado deste computador: bloqueio, último backup e captura rápida.
- **Atalhos:** `Ctrl+N` novo plan · `Ctrl+L` adicionar link · `Ctrl+Shift+L` salvar o link da área de transferência · `Ctrl+1…4` Início/Planner/Links/Tags · `Ctrl+B` barra lateral · `F5` apresentar · `F1` atalhos · `Ctrl+,` configurações (⌘ no macOS).
- **Captura rápida, de qualquer lugar:** `Ctrl+Shift+Espaço` abre uma janelinha flutuante. Se houver um link na área de transferência, `↵` salva na Caixa de entrada, já com título e imagem. Se você digitar, ela busca em plans, links, coleções e tags. Também abre pelo ícone da bandeja/barra de menus (que tem a opção de continuar rodando ao fechar). Há ainda o menu do Dock e a jump list do Windows.
- **Bloqueio com senha** (Configurações → Segurança): a senha é pedida ao abrir, após um tempo sem uso (1 a 60 min) e quando o computador dorme ou bloqueia a tela. **Janela → Bloquear o Waypoint** (`Ctrl+Alt+L`) ou o cadeado na barra de título bloqueia na hora. São no máximo cinco tentativas por minuto. As sessões não sobrevivem a fechar o app. O bloqueio protege o app aberto; para proteger os arquivos, use a criptografia de disco do sistema (FileVault, BitLocker). Para quem esqueceu a senha: apagar `security.json` da pasta de dados desativa o bloqueio sem perder nada.
- **Backups completos** (Configurações → Backups, ou o ícone de relógio na barra de título): cada backup é uma pasta com o banco, as imagens enviadas e as configurações de bloqueio. O backup automático pode ser diário, semanal ou desligado, e você escolhe quantos manter (5 a 50). A pasta de destino pode ser sincronizada (iCloud Drive, Google Drive, Dropbox). **Restaurar** salva antes o estado atual ("Antes de restaurar"), então dá para desfazer.
- **Links externos** abrem no navegador padrão. Páginas do Waypoint abertas "em nova aba" viram uma nova janela.
- A **extensão do navegador** continua funcionando: use o endereço mostrado em **Configurações → Aplicativo** (`http://127.0.0.1:47615`) com um token de API.

Como funciona: o processo principal (`desktop/src/main.ts`) sobe o build *standalone* do Next.js num *utility process* em `127.0.0.1`. A cada abertura ele gera uma chave nova e grava num cookie só da janela do app. O `src/proxy.ts` recusa qualquer requisição sem essa chave, exceto a API REST, que tem token próprio. Assim, outros programas e abas do navegador na mesma máquina não acessam os dados. O login automático fica em `src/app/api/desktop/session`.

```bash
npm run desktop:install   # dependências do Electron (uma vez)
npm run desktop:dev       # app com next dev (recarrega ao editar)
npm run desktop:dist      # gera os pacotes do sistema atual em desktop/release
```

Para gerar pacotes de outro sistema, use `npm run dist:win`, `dist:mac` ou `dist:linux` dentro de `desktop/`. O `.exe` do Windows também pode ser gerado a partir do Linux. O workflow `.github/workflows/desktop.yml` gera e testa os três sistemas a cada mudança em `desktop/`. Uma tag `v*` publica uma release com os arquivos.

## Arquitetura

```
src/
  app/                    rotas (App Router)
    (auth)/               login e cadastro
    (app)/                páginas com a barra lateral: início, plans, links, tags, configurações
    (canvas)/plans/[id]   editor (/edit) e modo visualização
    share/[token]         coleções compartilhadas por link
    api/                  busca, metadados, embed-check, assets, documentos de plans, exportação
  domain/                 modelo do Planner (independente do React Flow) e o adapter para o canvas
  features/               componentes por módulo (planner, links, home, tags, settings)
  components/             UI compartilhada (ui/) e shell (barra lateral, paleta de comandos)
  server/
    db/                   schema Drizzle e conexão
    services/             regras de negócio: plans, links, tags, busca, permissões, metadados…
    lib/                  fetch seguro contra SSRF, extração de metadados, parser de favoritos
drizzle/                  migrações SQL (inclui a tabela FTS5 de busca)
```

Decisões principais:

- **Documento por plan.** Nós, conexões e viewport ficam em JSON (`plan_documents`); os metadados ficam normalizados (`plans`, `plan_tags`…). Isso simplifica autosave, undo, versionamento, duplicação e exportação.
- **Domínio próprio para o canvas.** `src/domain/plan.ts` é o formato persistido; `src/domain/canvas-adapter.ts` converte para o React Flow. A biblioteca nunca define o formato salvo.
- **Rascunho × publicado.** O rascunho tem concorrência otimista (`version`): salvar com uma versão desatualizada retorna conflito. Publicar grava um snapshot em `plan_versions`, que é o que viewers enxergam.
- **Resources e backlinks.** Referências de nós são indexadas em `resource_refs`, o que alimenta o "Usado em" de links e coleções e prepara o terreno para um grafo de conhecimento.
- **Busca global.** Uma tabela FTS5 (`search_index`) indexa plans, blocos, coleções e links, com ranking bm25 e trechos destacados. É acessível de qualquer tela com ⌘K / Ctrl+K.
- **Segurança.** Toda busca de metadados passa por `safeFetch`, que valida o IP resolvido no momento da conexão (bloqueia redes privadas, loopback, link-local e metadata de cloud, o que também impede DNS rebinding). Ela também limita redirecionamentos, tempo de resposta, tamanho e content-type. Previews externos usam `iframe` com sandbox e caem para "abrir em nova aba" quando o site proíbe a incorporação; a proteção do site nunca é contornada. Uploads aceitam só imagens, com verificação de magic bytes. Permissões são checadas no servidor em páginas, actions e APIs.

## Permissões

| Papel | Pode |
| --- | --- |
| Owner | tudo, incluindo pessoas e visibilidade |
| Editor | criar e editar plans, coleções e links |
| Viewer | consultar; nunca vê ferramentas de edição |

Plans e coleções têm visibilidade `Privado`, `Workspace`, `Pessoas específicas` (plans), `Qualquer pessoa com o link` ou `Público`.

## Testes

- `npm test` — testes unitários (Vitest): domínio do Planner, adapter do canvas, SSRF, parser de favoritos, serviços com banco em memória.
- `npm run e2e` — smoke tests de ponta a ponta (Playwright): gera o build, sobe o app com um banco descartável e cobre cadastro, criação/edição/publicação de plan, links, busca global e layout mobile. Use `E2E_BASE_URL=http://localhost:3000 npm run e2e` para rodar contra um servidor já em execução.
- O CI (`.github/workflows/ci.yml`) roda typecheck, testes unitários, build e e2e em cada PR.

## Links quebrados

Em **Links**, use **Verificar links** (barra lateral, menu “…” de uma coleção ou seleção em lote) para checar se os links ainda respondem. O filtro rápido **Quebrados** reúne links quebrados (404, 410, 5xx…) e inacessíveis (DNS, timeout, 429). Links que hoje redirecionam para outro endereço ganham um ponto âmbar e a ação **Atualizar para a nova URL**; redirecionamentos de idioma, `http → https`, `www.` e barra final não contam.

A verificação (`src/server/services/link-health.ts`) usa `HEAD` com fallback para `GET` (corpo de até 16 KB), sempre via `safeFetch`, com no máximo 4 requisições simultâneas e intervalo mínimo por host. Links verificados nas últimas 24 h são pulados, a menos que a verificação seja forçada. A rota `POST /api/links/health` (sessão, editores) processa lotes de até 200 links e devolve `{ checked, ok, broken, redirect, unreachable, remaining }`; a interface chama em lotes pequenos e mostra o progresso.

## API & extensão

**Tokens de API.** Em *Configurações → Tokens de API*, crie um token pessoal (`wp_` + 40 caracteres). Ele aparece **uma única vez**; o banco guarda apenas o hash SHA-256 e um prefixo para identificação. Cada token vale para o workspace em que foi criado e age com o papel **atual** do seu dono ali (verificado a cada requisição): tokens de viewers só leem, e quem sai do workspace perde o acesso na hora. Revogue quando quiser.

**REST API (`/api/v1`).** Autenticação só por `Authorization: Bearer wp_…` (o cookie de sessão é ignorado), respostas JSON, erros como `{ "error": { "code", "message" } }`, limite por token (120 leituras e 30 escritas por minuto). CORS liberado apenas para origens de extensão (`chrome-extension://…`, `moz-extension://…`), com preflight `OPTIONS`.

| Método | Rota | Retorna |
| --- | --- | --- |
| `GET` | `/api/v1/me` | usuário, workspace, papel e `canWrite` |
| `GET` | `/api/v1/collections` | coleções visíveis em ordem de árvore, com `path` (“Development / Frontend”) |
| `GET` | `/api/v1/tags` | nomes das tags, mais usadas primeiro |
| `GET` | `/api/v1/links/lookup?url=` | `{ link }` já salvo para a URL, ou `{ link: null }` |
| `GET` | `/api/v1/links?q=&limit=` | links que combinam com a busca (mesma linguagem da biblioteca: `tag:`, `site:`, `in:`, `is:`…), os mais relevantes para você primeiro |
| `POST` | `/api/v1/links` | cria um link (`url`, `title?`, `description?`, `notes?`, `collectionId?`, `tags?`, `openBehavior?`); título, descrição, favicon e capa ausentes são buscados na página. Sem `collectionId`, o link vai para a **Caixa de entrada**. Resposta `201 { link }` com `appUrl` (`/links?open=<id>`) |
| `POST` | `/api/v1/links/:id/open` | registra que você abriu o link (alimenta “Para você” e o acesso rápido) |
| `GET` | `/api/v1/home` | acesso rápido, links recentes, plans recentes e contadores (caixa de entrada, quebrados) — usado pela nova aba da extensão |

```bash
curl -H "Authorization: Bearer $WAYPOINT_TOKEN" https://waypoint.example.com/api/v1/me
curl -X POST -H "Authorization: Bearer $WAYPOINT_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://react.dev/learn","tags":["react"]}' https://waypoint.example.com/api/v1/links
```

**Extensão “Salvar no Waypoint”.** A pasta [`extension/`](extension/README.md) tem uma extensão Manifest V3 (Chrome, Edge e Firefox, sem build): popup com coleção, tags e nota, menu de contexto e atalho <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>. Veja como instalar e configurar em [`extension/README.md`](extension/README.md).

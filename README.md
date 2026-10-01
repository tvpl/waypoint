# Waypoint — Visual Planner & Link Library

O lugar onde você organiza e encontra as coisas.

Waypoint tem dois módulos que compartilham workspace, tags, busca e compartilhamento:

- **Visual Planner** — um canvas para desenhar soluções macro (blocos, containers, notas, link cards, seções, imagens e conexões). Cada plan tem um **modo edição** com ferramentas e um **modo visualização** limpo, que parece uma página pronta. Rascunhos são salvos automaticamente; a publicação gera versões imutáveis que podem ser compartilhadas sem que edições em andamento quebrem o que outras pessoas veem.
- **Link Library** — um substituto completo para os favoritos do navegador: coleções aninhadas, tags, capas, descrições, três modos de visualização (cards, compacto e lista), filtros, preview interno ou nova aba, e importação/exportação no formato de favoritos dos navegadores.

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

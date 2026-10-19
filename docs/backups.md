# Backups e recuperação

Configurações › **Backup e dados** guarda **pontos de restauração** de cada workspace no próprio banco (`workspace_backups`, JSON compactado com gzip). Owners e editors veem a lista; viewers não.

## O que entra

Tudo o que pertence ao workspace: plans (rascunho, versões publicadas, membros, tags, comentários e referências), coleções, links e suas tags, tags, itens de biblioteca, projetos, blocos, modelos, tarefas com histórico e observações, lembretes, buscas salvas, marcas pessoais (estrelas e fixados), atalhos e preferências da página inicial e os registros de imagens. Os arquivos das imagens continuam em `UPLOADS_DIR`; o índice de busca e as referências entre plans são reconstruídos ao restaurar. Tokens de API, links de compartilhamento e membros do workspace não fazem parte do backup.

## Quando é feito

- **Automático:** depois que alguém abre o app, no máximo uma vez por dia (ou semana). Owners escolhem a frequência e quantos manter (7, 14, 30 ou 60).
- **Manual:** **Criar backup agora**, com uma nota (até 50 por workspace).
- **Antes de restaurar:** toda restauração completa salva antes o estado atual (mantidos os 10 últimos).
- **Enviado:** owners podem enviar um `.json` baixado antes (até 80 MB).

## Recuperar

- **Recuperar itens** compara o backup com o workspace atual e lista o que foi **excluído** (plans, coleções, links, projetos e tarefas) ou está **diferente** (tarefas e desenhos de plans). Itens excluídos voltam com os mesmos identificadores, então links antigos continuam funcionando; uma coleção traz de volta os links que estavam nela; um projeto traz seus blocos. Tarefas diferentes voltam à versão do backup, com registro no histórico. Plans diferentes voltam como cópia, sem tocar no atual.
- **Restaurar tudo** (owners) troca o conteúdo do workspace pelo do backup. Plans e coleções privados de outras pessoas não são alterados.
- **Criar workspace a partir dele** (owners) copia o backup para um workspace novo, com identificadores novos. É o caminho para backups de outro workspace ou de outro servidor.

## Fora do banco

- **Pasta:** com `WAYPOINT_BACKUP_DIR` (caminho absoluto) definido no servidor, cada ponto de restauração também é gravado em `<pasta>/workspace-<id>/<data>-<tipo>-<id>.json.gz`, e os arquivos acompanham a retenção. Use uma pasta sincronizada ou outro disco.
- **Senha:** **Baixar protegido por senha** gera o mesmo arquivo criptografado com AES-256-GCM e chave derivada da senha (scrypt). Ao enviar um arquivo protegido, o Waypoint pede a senha. Sem ela, não há como abrir.

## Atualização dos dados

Quando uma versão do Waypoint muda a estrutura do banco (migrações em `drizzle/`) ou o formato do que está salvo (atualizações de dados em `src/server/db/upgrades.ts`), um banco existente **não é alterado ao abrir**. Até a atualização, o app inteiro mostra o diálogo **Atualizar os dados** e nenhuma consulta roda contra a estrutura antiga.

- **Backup antes** (marcado por padrão): no desktop, um backup completo na central de backups, com a nota "Antes de atualizar" (não entra na limpeza automática). No servidor, uma cópia do arquivo do banco em `backups/pre-update-<data>-v<versão>.db`, ao lado dele, e em `WAYPOINT_BACKUP_DIR/database/` quando definida.
- **Atualização:** todas as migrações e atualizações de dados rodam numa única transação, com as chaves estrangeiras conferidas no fim. Se algo falhar, nada muda e o diálogo continua lá.
- **Quem pode:** no desktop, a janela do app. No servidor, qualquer pessoa com conta, já conectada ou confirmando e-mail e senha no diálogo.
- **Voltar atrás:** restaure o backup (desktop) ou ponha a cópia `.db` no lugar do banco com o servidor parado. Um backup antigo continua valendo: ao abrir, ele passa pela mesma atualização.
- **Sem diálogo:** `WAYPOINT_AUTO_UPDATE=1` faz a cópia e atualiza ao iniciar, para servidores sem ninguém para clicar. Um banco vazio (instalação nova) é sempre criado direto.

Para quem desenvolve: mudanças de estrutura seguem em `schema.ts` + `npm run db:generate`. Para converter conteúdo (por exemplo, subir `PLAN_SCHEMA_VERSION`), adicione uma entrada em `DATA_UPGRADES` com o `after` apontando para a migração mais recente. Ela roda uma vez, logo depois dessa migração e na mesma transação. Uma atualização que já foi publicada nunca deve ser editada nem removida.

## Lixeira

Plans, coleções e links excluídos vão para a **Lixeira** (`/trash`, também em Configurações › Backup e dados) por 30 dias, com Restaurar e Excluir definitivamente; depois disso são apagados. A recuperação de backups trata um item que ainda está na lixeira como excluído e o tira de lá.

## Privacidade

O arquivo baixado (owners) não inclui plans e coleções privados de outras pessoas; nesse caso ele é marcado como parcial. A lista de recuperação também só mostra o que a pessoa pode ver.

No aplicativo desktop, os **backups completos** do arquivo SQLite (com imagens e configurações de bloqueio) continuam na mesma aba e são independentes destes pontos de restauração.

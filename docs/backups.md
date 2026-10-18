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

## Lixeira

Plans, coleções e links excluídos vão para a **Lixeira** (`/trash`, também em Configurações › Backup e dados) por 30 dias, com Restaurar e Excluir definitivamente; depois disso são apagados. A recuperação de backups trata um item que ainda está na lixeira como excluído e o tira de lá.

## Privacidade

O arquivo baixado (owners) não inclui plans e coleções privados de outras pessoas; nesse caso ele é marcado como parcial. A lista de recuperação também só mostra o que a pessoa pode ver.

No aplicativo desktop, os **backups completos** do arquivo SQLite (com imagens e configurações de bloqueio) continuam na mesma aba e são independentes destes pontos de restauração.

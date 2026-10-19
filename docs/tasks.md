# Tarefas

O módulo `/tasks` reúne demandas do workspace em um board compacto. Owners e editors podem editar; viewers têm acesso de leitura. Tarefas, projetos, blocos e colunas são compartilhados com os membros do workspace, sem publicação pública.

- **Board contínuo:** a visão Todos reúne as tarefas principais em quatro etapas. Selecione um projeto para ver seus nomes de colunas e blocos próprios. Colunas adicionais seguem na horizontal, sem paginação. A opção Por linha alterna entre 3 e 4 colunas visíveis em telas com espaço suficiente.
- **Blocos por projeto:** use Novo bloco ou Colunas para criar, renomear e reorganizar etapas. Cada coluna tem um nome livre e uma etapa associada: A fazer, Em andamento, Aguardando ou Concluído. O bloco principal mantém as quatro etapas. Uma coluna usada só pode ser removida ou ter sua etapa alterada depois de mover suas tarefas.
- **Capacidade por coluna:** em Colunas, defina um limite opcional de tarefas em andamento. O contador mostra o total real da coluna, inclusive tarefas ocultas pelos filtros. Ultrapassar o limite sinaliza excesso sem impedir criações ou movimentos.
- **Colunas flexíveis:** o menu de cada coluna ajusta sua largura ou a recolhe. O título do bloco permite recolher o bloco inteiro. Exibição limita os cards inicialmente visíveis por coluna, com Ver mais para os restantes.
- **Arrastar:** mova para outra coluna, outro bloco ou antes de um card. A ordem Manual permite arrastar. Na visão Todos, trocar a etapa preserva o projeto da tarefa. Menus oferecem alternativas para mover e ordenar, inclusive no celular.
- **Captura rápida:** o `+` da coluna aceita título com `#marcadores`, `@Ana`, `@"Ana Silva"`, `hoje`, `amanhã`, data ISO e `!alta`, `!média` ou `!baixa`. `Enter` adiciona; `Shift+Enter` quebra linha. Cole checklists Markdown abaixo do título para criar subtarefas; os demais parágrafos viram contexto. A seta abre o editor completo com o conteúdo interpretado.
- **Cards compactos:** marcações e metadados em linha, menus de datas, subtarefas e pendências. Os detalhes abrem no painel lateral; apenas o título é obrigatório. O painel protege rascunhos e aceita `Cmd/Ctrl+Enter` para salvar.
- **Cores:** Neutro acompanha a identidade do projeto. Uma cor explícita destaca apenas o card. A paleta tem pares próprios para os temas claro e escuro.
- **Modelos de projeto:** no menu de um projeto, Salvar como modelo guarda a cor, blocos, nomes, ordem das colunas e capacidades. Novo projeto permite escolher um modelo. A estrutura é copiada com identificadores próprios; tarefas não são duplicadas. Modelos são compartilhados no workspace e podem ser excluídos sem afetar projetos criados a partir deles.
- **Dependências:** nos detalhes, Pendências e dependências permite vincular outras tarefas e ver a relação inversa, Desbloqueia. Vínculos são restritos ao workspace; o servidor recusa referências inválidas, autorreferências e ciclos. Uma marca discreta no card abre a lista de tarefas relacionadas. Os vínculos são informativos e não impedem concluir uma tarefa.
- **Acompanhamento:** Acompanhar em define quando revisitar uma demanda ou cobrar retorno, separadamente da meta de conclusão. A visão Acompanhar reúne tarefas abertas com acompanhamento para hoje ou atrasado e pode ser salva como visão pessoal. A data de acompanhamento não dispara avisos sozinha; use Lembretes para escolher quando e como receber um aviso.
- **Pendências:** classifique como pendência, aguardando retorno, bloqueado ou precisa de decisão. A indicação discreta no card abre a observação completa; filtros permitem reunir os itens do mesmo tipo.
- **Exibição pessoal:** escolha quais marcações aparecem: prazo, pessoas, tags, subtarefas/progresso, prioridade, pendência e nome do projeto. Densidade, limites, larguras e itens recolhidos são lembrados por usuário, workspace e projeto neste dispositivo.
- **Visões salvas:** Salvar visão guarda busca, etapa, prioridade, marcador, pessoa, pendência, período, ordenação e opção de ocultar concluídas. Os atalhos aparecem no projeto em que foram salvos e podem ser removidos. São preferências pessoais deste dispositivo.
- **Busca e filtros:** busca por título, contexto, pendência, subtarefa, projeto, marcador ou pessoa. `#tag` e `@pessoa` restringem o termo ao campo correspondente. Visões Meu dia (inclui atrasadas), próximos 7 dias, aguardando, concluídas e arquivadas.
- **Seleção em lote:** altere etapa, projeto ou data, arquive/restaure e copie em Markdown. Até 200 tarefas; uma seleção desatualizada é recusada inteira.
- **Pessoas de apoio:** referências textuais com sugestões dos membros e dos contatos já citados. Não criam contas, convites ou notificações.
- **Menu e atalhos:** botão direito ou reticências para abrir, mover, colorir, duplicar, copiar em Markdown e arquivar/restaurar. Arquivar oferece Desfazer. `N` cria, `/` busca e `g d` navega para Tarefas. No desktop, `Cmd/Ctrl+5` abre Tarefas.
- **Projetos:** agrupamentos opcionais com nome e cor. Excluir um projeto mantém suas tarefas sem projeto e remove sua configuração de blocos.

## Ocultar itens por etapa e data

O botão **Ocultar** da barra de filtros define, para a pasta atual (projeto, Sem projeto ou Todos), o que sai da tela em cada etapa: nada, tudo, ou só o que é **anterior a hoje**, **a esta semana** (semanas começam na segunda) ou **a este mês**. Concluídas contam pela data de conclusão; as demais, pela data de criação. Há atalhos prontos (concluídas; concluídas antes de hoje; concluídas de meses anteriores; tudo exceto o que está em andamento) e o item **Ocultar concluídas** do menu da página alterna a regra mais comum. Um chip mostra quantas tarefas estão ocultas e desfaz a regra com um clique. As regras ficam nas preferências deste dispositivo, junto com a exibição da pasta, e entram nas visões salvas. A visão **Concluídas**, a visão **Aguardando** e o filtro de etapa sempre mostram a etapa que pedem.

## Observações e histórico

Os detalhes da tarefa têm **Observações e histórico**: registre andamentos, decisões e retornos com data e autor (`Cmd/Ctrl+Enter` registra). O histórico também guarda criação, importação, mudanças de etapa (concluir, reabrir, mover), campos editados, arquivamento e restauração, inclusive pelas ações em lote e pela atualização via Markdown. Reordenar dentro da mesma coluna não gera registro. Quem escreveu uma observação pode excluí-la; owners podem excluir qualquer uma. Os eventos do ciclo de vida não são editáveis. Tarefas criadas antes desta versão começam o histórico na próxima alteração.

## Relatório de concluídas

No menu da página, **Relatório de concluídas** gera um Markdown com tudo o que foi concluído num período (esta semana, semana passada, este mês, mês passado, últimos 30 dias, este ano, personalizado ou todo o histórico), em todos ou alguns projetos. O relatório traz um resumo (quantidade, tempo médio até concluir, entregas no prazo, subtarefas), cada tarefa agrupada por projeto com datas de criação, conclusão e prazo, duração, prioridade, marcadores, pessoas, pendência, subtarefas, contexto, observações e histórico, uma linha do tempo por dia e, opcionalmente, o que está em andamento. Os períodos usam o fuso do navegador. A prévia formatada pode ser copiada ou baixada como `.md`. `/tasks?report=1` abre o relatório direto.

## Importantes

**Marcar como importante** (menu do card ou detalhes) coloca a tarefa em **Importantes**, na página inicial. A estrela é pessoal; viewers também podem usar. Tarefas concluídas ou arquivadas saem do painel.

## Calendário, agenda e recorrência

Além de **Quadro** e **Lista**, a página tem **Calendário** (mês, semanas começando na segunda; arraste uma tarefa para outro dia, ou da coluna Sem data, para mudar o prazo; o `+` ou o duplo clique num dia cria uma tarefa com aquela data) e **Agenda** (atrasadas, hoje, amanhã, os próximos sete dias, depois e sem data). O formato escolhido, a exibição, as regras de ocultar e as visões salvas ficam nas preferências pessoais do servidor (`user_preferences`, chave `tasks.board`) e acompanham a pessoa em qualquer dispositivo; o navegador guarda uma cópia para abrir rápido e para migrar o que estava salvo só nele.

**Repetir** (todo dia, dias úteis, toda semana ou todo mês) cria a próxima ocorrência quando a tarefa é concluída: mesmo título, contexto, projeto, bloco (na coluna A fazer), marcadores, pessoas e prioridade, com subtarefas desmarcadas e o prazo avançado a partir do prazo atual — se ele já passou, a data avança até depois de hoje. Mensal mantém o dia do mês, ajustado para meses mais curtos. Reabrir e concluir de novo não duplica a próxima ocorrência. Na captura rápida: `~diaria`, `~uteis`, `~semanal`, `~mensal`.

## Referências e tags

Nos detalhes, **Referências** liga a tarefa a plans, links e coleções do workspace (`task_links`). Os itens aparecem com o acesso de quem vê; o plan (ⓘ Detalhes) e o painel do link mostram de volta as **Tarefas ligadas**. Os marcadores das tarefas viram tags do workspace: a página de Tags conta tarefas, cada `#tag` lista as tarefas, e renomear ou excluir uma tag atualiza as tarefas.

## Criar tarefas de qualquer lugar

Na busca (⌘K) e na captura rápida do aplicativo, comece com `+` para criar uma tarefa com a sintaxe do quadro (`+ Enviar proposta amanhã #cliente @Ana !alta ~semanal`).

As tarefas arquivadas são carregadas só quando a visão Arquivadas é aberta.

## Lembretes e notificações do Mac

O botão **Lembretes** abre uma central pessoal do workspace. Também está disponível nos detalhes, no botão direito de um card e na barra de seleção. Os avisos não são enviados às pessoas citadas na tarefa.

- **Quando:** início, conclusão ou acompanhamento, cada um com dia e horário limite. A opção de definir apenas o dia mantém a meta para o dia inteiro e permite escolher o horário do aviso. O fuso do agendamento é exibido e preservado; o horário permanece um instante fixo ao viajar.
- **Antecedência:** no horário, 5, 15 ou 30 minutos, 1 hora ou 1 dia antes. O horário efetivo precisa estar no futuro. Os lembretes são independentes da data/meta do card e não a sobrescrevem.
- **Lotes:** uma tarefa, seleção, visão filtrada, projeto (o agrupamento equivalente a uma pasta de tarefas) ou bloco. Até 500 tarefas atuais por agendamento, com prévia da quantidade e verificação das versões no servidor. Tarefas criadas depois não herdam automaticamente o aviso. Concluídas e arquivadas ficam de fora; avisos de início também excluem tarefas em andamento.
- **Entrega:** notificação nativa com som, silenciosa ou somente na central. No desktop, o botão de teste ajuda a conferir a permissão em Ajustes do Sistema → Notificações → Waypoint. Estilo de banner/alerta, sons e Foco são controlados pelo macOS.
- **Adiar:** o aviso nativo oferece o intervalo escolhido (5, 15, 30 minutos, 1 ou 2 horas, ou 1 dia), além de Dispensar. Na central, escolha um desses intervalos ou uma data/hora personalizada. Selecione vários lembretes para adiar ou dispensar em lote. Os intervalos são somados ao horário atual do aviso, ou a agora quando ele já venceu; em lote, cada aviso preserva seu horário de referência. O adiamento altera apenas o próximo aviso, preservando a meta original. Para antecipar, use Reagendar.
- **Reagendar:** o lápis carrega os dados do aviso. Agendar novamente o mesmo tipo para a mesma tarefa substitui o lembrete pessoal anterior e invalida seus botões nativos antigos. Outros tipos e lembretes de outras pessoas são preservados.
- **Ciclo da tarefa:** iniciar dispensa o lembrete de início; concluir ou arquivar dispensa todos os lembretes da tarefa. Reabrir não os reativa. São permitidos até 1.000 lembretes ativos por pessoa.

A entrega nativa funciona com o aplicativo aberto, inclusive em segundo plano e sem a janela principal. Encerrar o aplicativo com `Cmd+Q` suspende a entrega; ao reabrir, os avisos vencidos são retomados. Depois do repouso, o agendador verifica novamente os horários. Avisos simultâneos são agrupados por workspace, com ações em lote, e o clique abre a tarefa ou a central no workspace correspondente. O processamento roda a cada 30 segundos e recebe no máximo 50 lembretes por rodada. Não há entrega enquanto a sessão está bloqueada; a permissão do sistema e o modo Foco podem limitar a exibição.

No navegador, a central permanece disponível; notificações nativas do Mac exigem o aplicativo desktop. Falhas de entrega ficam sinalizadas e são tentadas novamente com intervalo de cinco minutos. Reservas de entrega expiram após dois minutos para recuperar falhas ou reinícios antes da confirmação. Como o sistema operacional e o banco não compartilham uma transação, uma falha entre mostrar o banner e confirmar a entrega pode repetir o aviso. Não se usa fechamento do banner como confirmação de leitura; dispense explicitamente na central ou no botão do aviso.

## Markdown e IAs

O menu da página importa `.md`/texto colado e exporta a visão filtrada. O menu do card copia uma única tarefa. A prévia mostra o que será criado; importar sempre cria cópias, sem atualizar registros existentes. Até 200 tarefas e 250 mil caracteres por importação.

```md
## Redesign do site

- [ ] Preparar proposta
  Contexto com **Markdown**, links e código.
  - [x] Reunir briefing
  - [ ] Alinhar escopo

- [x] Definir objetivo
```

A exportação acrescenta um comentário `<!-- waypoint {...} -->` por tarefa para preservar etapa, nome e cor do projeto, bloco, coluna, data, prioridade, cor do card, marcadores, pessoas, tipo de pendência, acompanhamento, dependências e observação. Projetos, blocos e colunas são descritos por nomes; referências de tarefa e de subtarefa preservam identidade e versão para atualizar o que já existe. A importação resolve esses nomes dentro do workspace de destino e cria os agrupamentos necessários. O contexto é exportado como citação para distingui-lo das subtarefas. Preserve os comentários para um ciclo completo; checklists simples também funcionam. Alterar `[x]` para `[ ]` reabre uma tarefa concluída ao importar.

## Atualizar tarefas com Markdown

Exporte a visão ou copie uma tarefa e preserve os comentários `waypoint`, incluindo `ref`, versão e referências de subtarefas. Depois de editar o texto com uma IA, use **Atualizar via Markdown**:

1. Cole o conteúdo ou abra o arquivo e escolha Revisar alterações.
2. A prévia distingue tarefas alteradas, iguais e referências que precisam de revisão. Abra cada diferença para comparar Antes e Depois e selecione quais tarefas atualizar.
3. Aplicar atualiza os mesmos registros, sem criar cópias. Tarefas novas sem referência devem ser criadas em Importar Markdown.

Uma exportação desatualizada, tarefa arquivada, referência de outro workspace ou destino de projeto/coluna indisponível é sinalizado na revisão. O servidor recalcula a prévia antes de aplicar e verifica as versões novamente; mudanças concorrentes exigem nova revisão. As alterações selecionadas são aplicadas em uma transação, incluindo validação do grafo de dependências e atualização da busca. Tarefas ausentes no arquivo são mantidas.

Ao importar cópias com dependências, referências presentes no mesmo arquivo passam a apontar para as cópias. Referências externas devem existir no workspace de destino; caso contrário, a importação é recusada inteira. Inclua as tarefas relacionadas no arquivo para transportar seus vínculos para outro workspace.

O leitor oferece títulos, parágrafos, listas, citações, negrito, itálico, código e links HTTP(S). HTML é exibido como texto.

## Persistência

As migrações Drizzle `0009_modern_kang.sql`, `0010_serious_skrulls.sql`, `0011_busy_junta.sql` e `0012_thin_ted_forrester.sql` criam `task_projects`, `tasks`, `task_boards`, `task_templates` e `task_reminders`; `0013_long_sinister_six.sql` cria `task_events` (histórico e observações); `0014_tiny_surge.sql` cria `task_links` e a coluna `recurrence`. São aplicadas automaticamente quando o servidor abre o banco; reinicie um servidor já aberto para aplicar a nova migração. O backup SQLite do desktop inclui tarefas, organização compartilhada e agendamentos pessoais. Lembretes não são incluídos na exportação Markdown nem copiados junto com tarefas ou modelos. As preferências locais de exibição e visões salvas ficam no armazenamento do navegador.

Alterações verificam a função do usuário e o workspace no servidor. Versões de tarefa e de bloco evitam sobrescrever edições concorrentes. Importação, reordenação, exclusão de projeto e atualização do índice FTS usam transações. Tarefas ativas aparecem na busca global, incluindo nomes de blocos/colunas e tipos de pendência; arquivadas saem do índice.

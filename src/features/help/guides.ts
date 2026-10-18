import { Home, Link2, ListTodo, Monitor, PenTool, Search, Settings, Tag, Workflow } from "lucide-react";
import type { HelpModule } from "./types";

/**
 * The help center's content: one entry per module, in the order the help page lists them.
 * Tour targets are `data-tour` attributes on the real elements; a step whose target is not on
 * the page shows as a centered card.
 */
export const HELP_MODULES: HelpModule[] = [
  {
    id: "inicio",
    title: "Início",
    icon: Home,
    href: "/",
    match: /^\/$/,
    summary: "Seu painel: o que é importante, o que vence hoje e o que você mais usa.",
    purpose:
      "A Início reúne num só lugar o que pede a sua atenção agora: tarefas do dia, itens marcados como importantes, plans recentes e links à mão. Você escolhe quais seções aparecem e em que ordem, e cria atalhos para as páginas que mais usa.",
    features: [
      {
        title: "Busca e criação rápida",
        text: "A barra de busca encontra plans, links, coleções, tarefas e tags. Ao lado, os atalhos de criação começam um plan em branco, a partir de um modelo ou importado do Excalidraw.",
      },
      {
        title: "Personalizar",
        text: "Mostre, oculte e reordene as seções do painel. A arrumação fica salva para você, em cada workspace.",
      },
      {
        title: "Atalhos",
        text: "Seus próprios atalhos para qualquer página do Waypoint ou um endereço externo, com ícone e cor, na ordem que quiser. Há sugestões prontas, como Nova tarefa, Meu dia, Novo plan, Salvar link, Caixa de entrada, Relatório de concluídas, Backup e Ajuda.",
      },
      {
        title: "Importantes",
        text: "Tarefas, plans e coleções que você marcou com estrela, com filtro por tipo. Os links com estrela ficam em Links importantes.",
      },
      {
        title: "Para hoje",
        text: "Tarefas abertas que vencem hoje ou estão atrasadas, além dos acompanhamentos do dia.",
      },
      {
        title: "Plans recentes",
        text: "Os plans em que você mexeu por último, para retomar de onde parou.",
      },
      {
        title: "Pede atenção",
        text: "Conversas de comentários ainda abertas, links quebrados e links sem coleção. Um clique leva direto para resolver.",
      },
      {
        title: "Caixa de entrada",
        text: "Os links salvos pela extensão, pela API ou pela captura rápida que ainda não foram organizados.",
      },
      {
        title: "Acesso rápido e coleções fixadas",
        text: "Os links fixados abrem com as teclas 1 a 9. As coleções fixadas ficam logo abaixo, a um clique.",
      },
    ],
    tips: [
      "Fixe um link no acesso rápido com a tecla p na biblioteca de links.",
      "Use Personalizar para esconder as seções que você não usa: o painel fica mais curto e direto.",
      "Marque com estrela o que é prioridade (tarefas, plans, coleções e links) para vê-lo sempre aqui.",
    ],
    shortcuts: [
      ["Abrir item do acesso rápido", "1 … 9"],
      ["Buscar e comandos", "⌘K"],
      ["Ir para Início", "g h"],
      ["Atalhos de teclado", "?"],
    ],
    tour: [
      {
        title: "Bem-vindo à Início",
        body: "Este é o seu painel. Vamos ver rapidinho o que cada parte faz.",
      },
      {
        target: "home-search",
        title: "Busque qualquer coisa",
        body: "Encontre plans, links, coleções, tarefas e tags sem sair daqui. Funciona também com ⌘K em qualquer tela.",
      },
      {
        target: "home-create",
        title: "Crie em um clique",
        body: "Comece um plan em branco, a partir de um modelo ou de um desenho do Excalidraw.",
      },
      {
        target: "home-customize",
        title: "Deixe do seu jeito",
        body: "Mostre, oculte e reordene as seções. A arrumação fica salva para você neste workspace.",
      },
      {
        target: "home-shortcuts",
        title: "Seus atalhos",
        body: "Adicione atalhos para páginas do Waypoint ou sites externos, com ícone e cor. Há sugestões prontas para começar.",
      },
      {
        target: "home-important",
        title: "Importantes",
        body: "Tudo o que você marcou com estrela: tarefas, plans e coleções. Filtre por tipo quando a lista crescer.",
      },
      {
        target: "home-today",
        title: "Para hoje",
        body: "Tarefas que vencem hoje ou estão atrasadas, e os acompanhamentos do dia.",
      },
      {
        target: "home-attention",
        title: "Pede atenção",
        body: "Comentários sem resposta, links quebrados e links sem coleção, prontos para resolver.",
      },
      {
        target: "home-quick",
        title: "Acesso rápido",
        body: "Seus links fixados. Pressione 1 a 9 para abrir sem tirar as mãos do teclado.",
      },
    ],
  },
  {
    id: "planner",
    title: "Planner",
    icon: Workflow,
    href: "/plans",
    match: /^\/plans\/?$/,
    summary: "Seus plans: mapas, arquiteturas e roadmaps do workspace.",
    purpose:
      "O Planner guarda os plans do workspace: desenhos de soluções, arquiteturas, roadmaps e fluxos em que cada bloco pode levar a um link, coleção ou outro plan. Nesta lista você cria, importa, encontra e organiza os plans; o desenho em si acontece no editor.",
    features: [
      {
        title: "Novo plan",
        text: "Comece em branco ou de um modelo pronto: Roadmap trimestral, Arquitetura de sistema, Quadro de status, Registro de decisão ou Retrospectiva. Tudo continua editável.",
      },
      {
        title: "Importar",
        text: "Traga um JSON do Waypoint, um arquivo .excalidraw ou um PNG/SVG exportado do Excalidraw com a cena. O desenho vira um plan novo.",
      },
      {
        title: "Abas",
        text: "Meus plans, Compartilhados (de outras pessoas ou com você), Templates e Arquivados.",
      },
      {
        title: "Filtrar",
        text: "Digite parte do título, da descrição ou de uma tag para encontrar um plan na lista.",
      },
      {
        title: "Status de cada plan",
        text: "O card mostra se o plan é Rascunho, Publicado, Template ou Arquivado. Plans que você só pode ver aparecem como somente leitura.",
      },
      {
        title: "Menu do card",
        text: "Abrir, editar, duplicar, salvar como template e exportar JSON. Quem é dono também arquiva, restaura ou exclui.",
      },
      {
        title: "Templates do workspace",
        text: "Transforme qualquer plan em ponto de partida com Salvar como template. Em Templates, Usar template cria um plan novo a partir dele.",
      },
      {
        title: "Compartilhar com segurança",
        text: "Quem lê vê a última versão publicada, nunca o rascunho em andamento. A visibilidade vai de Privado a Público, passando por Workspace, Pessoas específicas e Qualquer pessoa com o link.",
      },
    ],
    tips: [
      "Plans publicados e templates abrem no modo visualização; use Editar no menu do card para ir direto ao editor.",
      "Passe o mouse em Planner na barra lateral para ver os plans recentes e os fixados.",
      "Arquivar tira o plan das listas e da busca sem apagar nada: dá para restaurar a qualquer momento.",
    ],
    shortcuts: [
      ["Ir para Planner", "g p"],
      ["Buscar plans e blocos", "⌘K"],
      ["Comandos (ex.: Novo plan)", "⌘K >"],
    ],
    tour: [
      {
        title: "Seus plans",
        body: "Aqui ficam os mapas, arquiteturas e roadmaps do workspace. Vamos conhecer a lista.",
      },
      {
        target: "planner-create",
        title: "Criar ou importar",
        body: "Novo plan oferece modelos prontos. Importar aceita JSON do Waypoint e arquivos do Excalidraw.",
      },
      {
        target: "planner-tabs",
        title: "Abas",
        body: "Alterne entre os seus plans, os compartilhados, os templates e os arquivados.",
      },
      {
        target: "planner-filter",
        title: "Encontre rápido",
        body: "Filtre a lista pelo título, pela descrição ou por uma tag.",
      },
      {
        target: "planner-grid",
        title: "Cards dos plans",
        body: "Clique para abrir. O menu ⋯ de cada card duplica, salva como template, exporta ou arquiva.",
      },
      {
        target: "nav-plans",
        title: "Sempre à mão",
        body: "Passe o mouse em Planner na barra lateral para ver os recentes e os fixados.",
      },
    ],
  },
  {
    id: "editor",
    title: "Editor de plans",
    icon: PenTool,
    href: null,
    match: /^\/plans\/[^/]+\/edit/,
    summary: "O canvas: desenhe, conecte, anote, publique e apresente.",
    purpose:
      "O editor é onde o plan ganha forma: formas e setas no estilo do Excalidraw, blocos ligados a links e outros plans, camadas para comparar propostas e anotações para revisar. Tudo é salvo automaticamente como rascunho, e só a versão publicada chega a quem lê.",
    features: [
      {
        title: "Ferramentas de desenho",
        text: "Retângulo, losango, elipse, seta, linha, lápis, texto, quadro e borracha, com as mesmas teclas do Excalidraw (ou 1 a 0). Mais formas (S) traz hexágono, cilindro, nuvem, documento e outras.",
      },
      {
        title: "Blocos que levam a algum lugar",
        text: "Blocos, containers, notas, cartões de link, seções e imagens podem apontar para um link, uma coleção, outro plan ou um arquivo. Colar ou soltar uma URL no canvas já cria o cartão com título e capa.",
      },
      {
        title: "Inserir rápido e Biblioteca",
        text: "Pressione / ou clique duas vezes no canvas para buscar e inserir ali. A Biblioteca tem ícones, logotipos e kits (sistemas, Kafka, nuvem no estilo AWS, C4, fluxograma, wireframes, produto), além da sua própria biblioteca.",
      },
      {
        title: "Camadas e visões",
        text: "Empilhe a base e as propostas por cima; oculte, trave ou deixe uma camada transparente. Salve visões com combinações de camadas e compare duas lado a lado.",
      },
      {
        title: "Anotações",
        text: "A ferramenta Anotar (N) cria marcadores numerados, balões, chaves e áreas destacadas, com tipo: Observação, Dúvida, Risco, Decisão ou A fazer. ⇧N oculta ou mostra todas.",
      },
      {
        title: "Alinhar e organizar",
        text: "Guias mostram alinhamento e espaçamentos iguais ao arrastar. O layout automático organiza tudo (ou só a seleção) na vertical ou na horizontal.",
      },
      {
        title: "Comentários",
        text: "Converse sobre o plan, um bloco ou uma camada, com respostas, @menções e resolução.",
      },
      {
        title: "Rascunho, publicação e histórico",
        text: "O rascunho é salvo sozinho; Publicar cria uma versão que é o que as outras pessoas veem. O histórico restaura qualquer versão no rascunho.",
      },
      {
        title: "Apresentar e exportar",
        text: "Apresente passo a passo, por seções ou quadros, em tela cheia. Exporte PNG, SVG, PDF, JSON ou Excalidraw (arquivo, imagem editável ou cópia para colar).",
      },
    ],
    tips: [
      "Ao selecionar algo surge a barra rápida e as propriedades; I recolhe ou mostra o painel, e o alfinete o fixa ao lado do canvas.",
      "⌘\\ liga o modo foco, só com o desenho.",
      "⌥ ao arrastar deixa uma cópia no lugar; ⌘ ao arrastar desliga as guias.",
      "Para rever este tour, use Mais opções (⋯) › Ajuda.",
    ],
    shortcuts: [
      ["Selecionar · mover canvas · conectar", "v h c"],
      ["Retângulo · losango · elipse · mais formas", "R D O S"],
      ["Seta · linha · texto · quadro", "A L T F"],
      ["Desenhar · borracha", "P E"],
      ["Anotar · mostrar/ocultar anotações", "N ⇧N"],
      ["Inserir qualquer coisa aqui", "/"],
      ["Propriedades · modo foco", "I ⌘\\"],
      ["Organizar vertical · horizontal", "⇧L ⌥⇧L"],
      ["Desfazer · refazer", "⌘Z ⇧⌘Z"],
      ["Zoom: aproximar · afastar · 100% · ajustar", "+ - 0 1"],
    ],
    tour: [
      {
        title: "Bem-vindo ao editor",
        body: "Aqui você desenha o plan. Tudo é salvo automaticamente como rascunho.",
      },
      {
        target: "editor-tools",
        title: "Ferramentas",
        body: "Formas, setas, lápis, texto, quadros, anotações e conexões. Cada uma tem a sua tecla, como no Excalidraw.",
      },
      {
        target: "editor-panel",
        title: "Painel lateral",
        body: "Insira elementos e recursos (links, coleções, outros plans) arrastando para o canvas. Ele recolhe para uma faixa de ícones.",
      },
      {
        target: "editor-library",
        title: "Biblioteca",
        body: "Ícones, logotipos e kits prontos para arquitetura, nuvem, fluxogramas e wireframes. Clique ou arraste para o canvas.",
      },
      {
        target: "editor-layers",
        title: "Camadas e visões",
        body: "Desenhe propostas sobre a base, trave o que não deve mexer e salve visões para comparar.",
      },
      {
        target: "editor-details",
        title: "Detalhes do plan",
        body: "Título, descrição, tags e a paleta de cores do plan ficam aqui.",
      },
      {
        target: "editor-comments",
        title: "Comentários",
        body: "Converse sobre o plan, um bloco ou uma camada, com @menções.",
      },
      {
        target: "editor-publish",
        title: "Publicar",
        body: "Quem lê só vê a versão publicada. Publique quando o rascunho estiver pronto.",
      },
      {
        target: "editor-more",
        title: "Mais opções",
        body: "Exporte em PNG, SVG, PDF, JSON ou Excalidraw. A Ajuda também fica aqui.",
      },
    ],
  },
  {
    id: "links",
    title: "Links",
    icon: Link2,
    href: "/links",
    match: /^\/links/,
    summary: "Seus favoritos, organizados em coleções, tags e buscas salvas.",
    purpose:
      "A biblioteca de links substitui os favoritos do navegador: coleções aninhadas, tags, capas, notas e busca com operadores. Ela também avisa sobre links quebrados e recebe o que você salva pela extensão, pela API ou pela captura rápida.",
    features: [
      {
        title: "Coleções e subcoleções",
        text: "Organize como pastas, com ícone e cor; arraste para reordenar ou mover. Uma coleção pode ser fixada na Início ou compartilhada por link.",
      },
      {
        title: "Filtros rápidos",
        text: "Caixa de entrada, Recentes, Com estrela, Sem coleção, Quebrados, Compartilhados e Arquivados, sempre na barra lateral.",
      },
      {
        title: "Busca com operadores",
        text: "Combine texto com tag:, site:, in:, is: (ex.: is:starred) e added: (ex.: added:7d); um - na frente exclui. Salvar busca guarda o filtro na barra lateral.",
      },
      {
        title: "Adicionar links",
        text: "Use o botão, cole uma URL na página ou solte um link nela. Adicionar vários links aceita até 100 de uma vez, com revisão de duplicados.",
      },
      {
        title: "Visualização e ordem",
        text: "Cards, compacto ou lista, com densidade, capas e agrupamento por domínio, tag ou data. Ordene por Para você, Adicionados, Abertos recentemente, Mais abertos, Título ou Manual.",
      },
      {
        title: "Detalhes e prévia",
        text: "O painel lateral edita título, URL, coleção, tags, descrição e notas sem sair da lista. A prévia abre o site ali mesmo, ou em nova aba quando o site não permite.",
      },
      {
        title: "Seleção em lote",
        text: "Marque com a caixa, com Shift para intervalos ou ⌘A. Mova, aplique tags, copie as URLs ou arquive tudo de uma vez.",
      },
      {
        title: "Links saudáveis",
        text: "Verificar links encontra quebrados e redirecionamentos, com a opção de atualizar para a nova URL. Também dá para achar duplicados e buscar ícones e capas que faltam.",
      },
      {
        title: "Caixa de entrada, importação e exportação",
        text: "O que chega pela extensão ou pela API cai na Caixa de entrada; Triar agora organiza um por vez. Importe favoritos do navegador e exporte em HTML, CSV ou JSON.",
      },
    ],
    tips: [
      "Pressione / para filtrar e n para um novo link; j e k andam pela lista.",
      "Fixe um link (p) para que ele apareça no acesso rápido da Início, com as teclas 1 a 9.",
      "O clique direito num link, ou no espaço vazio, mostra todas as ações disponíveis.",
    ],
    shortcuts: [
      ["Filtrar (aceita tag: site: in: is: added:)", "/"],
      ["Novo link (ou cole uma URL na página)", "n"],
      ["Mover entre links", "j k"],
      ["Abrir o link em foco", "↵"],
      ["Abrir em nova aba", "o"],
      ["Selecionar", "x"],
      ["Estrela", "s"],
      ["Fixar no acesso rápido", "p"],
      ["Editar", "e"],
      ["Arquivar", "#"],
      ["Ir para Links", "g l"],
    ],
    tour: [
      {
        title: "Sua biblioteca de links",
        body: "Um lugar para todos os seus favoritos, com coleções, tags e busca. Vamos ao passeio.",
      },
      {
        target: "links-quick",
        title: "Filtros rápidos",
        body: "Caixa de entrada, recentes, com estrela, sem coleção, quebrados e arquivados, a um clique.",
      },
      {
        target: "links-collections",
        title: "Coleções",
        body: "Organize como pastas e subcoleções. Arraste para reordenar; o menu ⋯ edita, fixa e compartilha.",
      },
      {
        target: "links-add",
        title: "Adicionar link",
        body: "Título, descrição, ícone e capa são buscados sozinhos. Colar uma URL na página também funciona.",
      },
      {
        target: "links-search",
        title: "Busca com operadores",
        body: "Experimente tag:, site:, in: ou is:starred. Uma busca útil pode ser salva na barra lateral.",
      },
      {
        target: "links-tag-filter",
        title: "Filtrar por tag",
        body: "Escolha uma ou mais tags para ver só os links desses assuntos.",
      },
      {
        target: "links-view",
        title: "Como ver e ordenar",
        body: "Cards, compacto ou lista, e a ordem que preferir, como Para você ou Mais abertos.",
      },
      {
        target: "links-more",
        title: "Mais ações",
        body: "Verifique links quebrados, encontre duplicados, importe favoritos e exporte a biblioteca.",
      },
    ],
  },
  {
    id: "tarefas",
    title: "Tarefas",
    icon: ListTodo,
    href: "/tasks",
    match: /^\/tasks/,
    summary: "Demandas do workspace num board compacto, com lembretes e relatórios.",
    purpose:
      "Tarefas reúne as demandas do workspace em um board por etapas: A fazer, Em andamento, Aguardando e Concluído. Projetos organizam o trabalho em blocos e colunas próprios, e visões como Meu dia mostram só o que importa agora.",
    features: [
      {
        title: "Board por etapas e projetos",
        text: "Cada projeto pode ter seus blocos, colunas e limites por coluna. Arraste cards entre colunas, blocos e projetos.",
      },
      {
        title: "Captura rápida",
        text: "O + da coluna entende #marcadores, @pessoas, hoje, amanhã e !alta. Cole uma checklist em Markdown para criar subtarefas.",
      },
      {
        title: "Visões, busca e filtros",
        text: "Meu dia, Próximos 7 dias, Aguardando, Acompanhar, Concluídas e Arquivadas, com filtros por etapa, prioridade, marcador, pessoa e período. Salvar visão guarda a combinação.",
      },
      {
        title: "Ocultar itens",
        text: "Por projeto e por etapa, oculte tudo ou só o que é de antes de hoje, desta semana ou deste mês (concluídas pela data de conclusão, as demais pela de criação). Um aviso mostra quantos estão ocultos e traz de volta com um clique.",
      },
      {
        title: "Detalhes, observações e histórico",
        text: "O painel lateral tem datas, acompanhamento, pendências, dependências e subtarefas. Em Observações e histórico, registre observações datadas e veja a linha do tempo: criação, mudanças de etapa, edições, arquivamento e observações.",
      },
      {
        title: "Importante",
        text: "Marque uma tarefa com estrela no menu do card ou nos detalhes. Ela passa a aparecer em Importantes, na Início.",
      },
      {
        title: "Lembretes",
        text: "Avisos pessoais para o início, a conclusão ou o acompanhamento, com antecedência. No aplicativo de desktop, chegam como notificação do sistema.",
      },
      {
        title: "Relatório de concluídas",
        text: "No menu da página, gere em Markdown tudo o que foi concluído num período e nos projetos escolhidos, com datas, duração, tags, pessoas, subtarefas, observações e histórico. Veja a prévia, copie ou baixe o .md.",
      },
      {
        title: "Markdown, lote e IAs",
        text: "Importe checklists, exporte a visão e atualize tarefas a partir de um Markdown editado por uma IA. A seleção em lote muda etapa, projeto ou data de até 200 tarefas.",
      },
    ],
    tips: [
      "Pressione n para criar e / para buscar; #tag e @pessoa na busca restringem ao campo certo.",
      "Ocultar itens fica guardado por projeto neste dispositivo: em outro computador, tudo aparece de novo.",
      "Use Acompanhar em para lembrar de cobrar um retorno, separado do prazo da tarefa.",
      "Gostou da estrutura de um projeto? Menu do projeto › Salvar como modelo.",
    ],
    shortcuts: [
      ["Nova tarefa", "n"],
      ["Buscar tarefas, pessoas e marcadores", "/"],
      ["Salvar nos detalhes", "⌘↵"],
      ["Ir para Tarefas", "g d"],
    ],
    tour: [
      {
        title: "Suas tarefas",
        body: "Um board compacto para as demandas do workspace. Vamos ver as partes principais.",
      },
      {
        target: "tasks-projects",
        title: "Projetos",
        body: "Escolha um projeto para ver os seus blocos e colunas, ou fique em Todos para ver tudo junto.",
      },
      {
        target: "tasks-scope",
        title: "Visões",
        body: "Meu dia, Próximos 7 dias, Aguardando, Acompanhar, Concluídas e Arquivadas.",
      },
      {
        target: "tasks-board",
        title: "O board",
        body: "Arraste os cards entre as colunas. Clique num card para abrir os detalhes ao lado.",
      },
      {
        target: "tasks-new",
        title: "Nova tarefa",
        body: "Só o título é obrigatório. Na captura rápida, #marcadores, @pessoas e datas como amanhã já são entendidos.",
      },
      {
        target: "tasks-filters",
        title: "Filtros",
        body: "Refine por etapa, prioridade, marcador, pessoa, pendência ou período, e salve a combinação como visão.",
      },
      {
        target: "tasks-hide",
        title: "Ocultar itens",
        body: "Esconda, por etapa, o que é antigo: tudo, ou o que é de antes de hoje, desta semana ou deste mês.",
      },
      {
        target: "tasks-reminders",
        title: "Lembretes",
        body: "Sua central de avisos: agende, adie ou dispense lembretes de início, conclusão e acompanhamento.",
      },
      {
        target: "tasks-menu",
        title: "Menu da página",
        body: "Importe e exporte Markdown e gere o Relatório de concluídas de um período.",
      },
    ],
  },
  {
    id: "tags",
    title: "Tags",
    icon: Tag,
    href: "/tags",
    match: /^\/tags/,
    summary: "Assuntos compartilhados entre plans e links.",
    purpose:
      "Tags marcam assuntos em comum entre o Planner e a biblioteca de links. A página de uma tag reúne os plans, os links e até os blocos dentro dos plans que tratam daquele tema.",
    features: [
      {
        title: "Uma ponte entre módulos",
        text: "A mesma tag vale para links, plans e blocos. Assim um tema reúne o desenho e as referências.",
      },
      {
        title: "Página da tag",
        text: "Abra uma tag para ver todos os plans, links e blocos com ela, com as contagens no topo.",
      },
      {
        title: "Filtrar tags",
        text: "Digite parte do nome para achar uma tag; o # no começo é opcional.",
      },
      {
        title: "Uso de cada tag",
        text: "Cada card mostra quantos plans e links usam a tag, e uma barra compara com a mais usada.",
      },
      {
        title: "Cores",
        text: "Dê uma cor a uma tag para destacá-la na barra lateral de links e nos cards.",
      },
      {
        title: "Renomear e excluir",
        text: "Renomear atualiza a tag em todos os itens. Excluir só tira a tag dos links e plans, sem apagar nada.",
      },
    ],
    tips: [
      "Na biblioteca de links, tag:nome na busca filtra pelos links com aquela tag.",
      "As tags de um plan ficam no botão ⓘ ao lado do título, no editor.",
      "Tarefas usam marcadores próprios (#marcador), separados destas tags.",
    ],
    shortcuts: [
      ["Ir para Tags", "g t"],
      ["Buscar tags (e o resto)", "⌘K"],
    ],
    tour: [
      {
        title: "Tags",
        body: "Assuntos compartilhados entre plans e links. Vamos ver como aproveitar.",
      },
      {
        target: "tags-header",
        title: "Uma ponte entre módulos",
        body: "A mesma tag marca links, plans e blocos, e reúne tudo sobre um tema.",
      },
      {
        target: "tags-filter",
        title: "Encontre uma tag",
        body: "Digite parte do nome para filtrar a lista.",
      },
      {
        target: "tags-grid",
        title: "Todas as tags",
        body: "Cada card mostra quantos plans e links usam a tag. Clique para ver tudo o que ela reúne.",
      },
      {
        target: "tags-card",
        title: "Cor, nome e exclusão",
        body: "Passe o mouse num card e use o menu ⋯ para mudar a cor, renomear ou excluir a tag.",
      },
      {
        target: "nav-search",
        title: "Busca global",
        body: "Tags também aparecem na busca (⌘K), junto com plans, links e tarefas.",
      },
    ],
  },
  {
    id: "busca",
    title: "Busca e comandos",
    icon: Search,
    href: null,
    match: /^$/,
    summary: "⌘K encontra qualquer coisa e executa ações sem tirar as mãos do teclado.",
    purpose:
      "A busca global procura em todo o workspace de qualquer tela: tarefas, plans, blocos dentro dos plans, links, coleções e tags. A mesma janela também executa comandos, como criar um plan, adicionar um link ou trocar de workspace.",
    features: [
      {
        title: "Busca em tudo",
        text: "Resultados agrupados por tipo, com o trecho que combinou destacado. Blocos aparecem com o nome do plan em que estão.",
      },
      {
        title: "Escopos",
        text: "Restrinja a busca a Plans, Links, Coleções, Tarefas ou Tags quando a lista ficar grande.",
      },
      {
        title: "Recentes",
        text: "Sem digitar nada, a janela mostra o que você abriu por último.",
      },
      {
        title: "Modo comandos",
        text: "Comece com > para ver só ações: Novo plan, Adicionar link, Nova coleção, Importar favoritos, ir para uma seção, alternar o tema e ver os atalhos.",
      },
      {
        title: "Ações do contexto",
        text: "Em Links aparecem atalhos para ver quebrados, com estrela ou ordenar por Para você. Num plan aberto, Apresentar este plan.",
      },
      {
        title: "Abrir links do seu jeito",
        text: "↵ abre um link como ele estiver configurado; ⌘↵ abre em nova aba.",
      },
      {
        title: "Trocar de workspace",
        text: "Os outros workspaces de que você participa aparecem como comandos.",
      },
    ],
    tips: [
      "Pressione ? em qualquer tela para ver todos os atalhos de teclado.",
      "Use g e uma letra para pular de seção: g h Início, g p Planner, g l Links, g d Tarefas, g t Tags, g s Configurações.",
      "No aplicativo de desktop, a captura rápida também busca, mesmo com a janela fechada.",
    ],
    shortcuts: [
      ["Buscar e comandos", "⌘K"],
      ["Só comandos", "⌘K >"],
      ["Navegar nos resultados", "↑ ↓"],
      ["Abrir", "↵"],
      ["Abrir link em nova aba", "⌘↵"],
      ["Fechar", "esc"],
      ["Atalhos de teclado", "?"],
    ],
    tour: [],
  },
  {
    id: "configuracoes",
    title: "Configurações",
    icon: Settings,
    href: "/settings",
    match: /^\/settings/,
    summary: "Conta, aparência, workspace, integrações, backups e dados.",
    purpose:
      "Em Configurações você ajusta a sua conta e a aparência do Waypoint, cuida das pessoas do workspace e conecta a extensão e outras ferramentas. A aba Backup e dados garante que nada se perca: pontos de restauração, recuperação de itens e exportações.",
    features: [
      {
        title: "Conta",
        text: "Seu perfil (como você aparece para o workspace) e a sua senha.",
      },
      {
        title: "Aparência",
        text: "Tema claro, escuro ou do sistema, e a opção de reduzir as animações.",
      },
      {
        title: "Workspace",
        text: "Nome do workspace, pessoas e papéis: owners gerenciam tudo, editors criam e editam, viewers só consultam.",
      },
      {
        title: "Integrações",
        text: "Tokens de API pessoais e a configuração da extensão do navegador Salvar no Waypoint. O token aparece uma única vez; revogue quando quiser.",
      },
      {
        title: "Pontos de restauração",
        text: "O Waypoint guarda no servidor backups automáticos diários e os que você criar na hora. Baixe qualquer um como .json ou envie um backup para restaurar.",
      },
      {
        title: "Restaurar com segurança",
        text: "Restaure tudo (antes, o Waypoint salva um backup Antes de restaurar) ou recupere só itens excluídos ou alterados: plans, coleções, links, projetos e tarefas.",
      },
      {
        title: "Seus dados",
        text: "Exportações de links e acesso aos itens arquivados, também em Backup e dados.",
      },
      {
        title: "Aplicativo",
        text: "Só no aplicativo de desktop: bloqueio com senha, backups completos do app e ajustes da janela.",
      },
    ],
    tips: [
      "Antes de uma grande reorganização, crie um ponto de restauração com Fazer backup agora.",
      "Dá para abrir uma aba direto pelo endereço, como /settings?tab=backup.",
      "Recuperar um item específico não mexe no resto do workspace.",
    ],
    shortcuts: [
      ["Ir para Configurações", "g s"],
      ["Alternar tema (pela busca)", "⌘K >"],
    ],
    tour: [
      {
        title: "Configurações",
        body: "Tudo o que ajusta o Waypoint para você e para o workspace. Vamos às abas.",
      },
      {
        target: "settings-tabs",
        title: "Abas",
        body: "Cada assunto tem a sua aba. Dá para abrir uma direto pelo endereço, como /settings?tab=backup.",
      },
      {
        target: "settings-tab-conta",
        title: "Conta",
        body: "Seu nome, como você aparece para o workspace, e a sua senha.",
      },
      {
        target: "settings-tab-aparencia",
        title: "Aparência",
        body: "Tema claro, escuro ou do sistema, e animações reduzidas.",
      },
      {
        target: "settings-tab-workspace",
        title: "Workspace",
        body: "Nome, pessoas e papéis: owner, editor ou viewer.",
      },
      {
        target: "settings-tab-integracoes",
        title: "Integrações",
        body: "Tokens de API e a extensão do navegador para salvar links de qualquer página.",
      },
      {
        target: "settings-tab-backup",
        title: "Backup e dados",
        body: "Pontos de restauração diários e manuais, recuperação de itens específicos, exportações e arquivados.",
      },
    ],
  },
  {
    id: "aplicativo",
    title: "Aplicativo de desktop",
    icon: Monitor,
    href: null,
    match: /^$/,
    desktopOnly: true,
    summary: "Recursos do app para Windows, macOS e Linux: captura rápida, bloqueio e backups.",
    purpose:
      "O aplicativo traz o Waypoint para fora do navegador, com o próprio servidor e banco: funciona offline e sem login. Ele soma recursos do computador, como a captura rápida de qualquer lugar, o bloqueio com senha e backups completos numa pasta sua.",
    features: [
      {
        title: "Barra de título",
        text: "Menu com ícones e atalhos (Arquivo, Editar, Exibir, Ir, Janela, Ajuda), voltar e avançar e a busca. À direita: captura rápida, status do backup, cadeado e tema.",
      },
      {
        title: "Captura rápida",
        text: "⌘⇧Espaço abre uma janelinha de qualquer lugar. Com um link na área de transferência, ↵ salva na Caixa de entrada; digitando, ela busca em plans, links, coleções e tags.",
      },
      {
        title: "Bloqueio com senha",
        text: "A senha é pedida ao abrir, após um tempo sem uso e quando o computador dorme. O cadeado na barra de título bloqueia na hora.",
      },
      {
        title: "Backups completos",
        text: "Cada backup é uma pasta com o banco, as imagens e as configurações de bloqueio, automático (diário ou semanal) ou manual. Restaurar salva antes o estado atual, então dá para desfazer.",
      },
      {
        title: "Bandeja e janelas",
        text: "O app pode continuar na bandeja (ou na barra de menus) ao fechar a janela. Páginas abertas em nova aba viram uma nova janela.",
      },
      {
        title: "Notificações de lembretes",
        text: "Os lembretes de tarefas chegam como notificação do sistema, com adiar e dispensar, mesmo com o app em segundo plano.",
      },
      {
        title: "Extensão do navegador",
        text: "Continua funcionando com o endereço local mostrado em Configurações › Aplicativo e um token de API.",
      },
    ],
    tips: [
      "No Windows e no Linux, use Ctrl no lugar de ⌘ nos atalhos.",
      "Aponte a pasta de backups para uma pasta sincronizada (iCloud Drive, Google Drive, Dropbox) para ter uma cópia fora do computador.",
      "Esqueceu a senha do bloqueio? Apagar o arquivo security.json da pasta de dados desativa o bloqueio sem perder nada.",
      "Alt sozinho leva o foco ao menu da barra de título.",
    ],
    shortcuts: [
      ["Captura rápida (de qualquer lugar)", "⌘⇧Espaço"],
      ["Novo plan", "⌘N"],
      ["Adicionar link", "⌘L"],
      ["Salvar o link da área de transferência", "⌘⇧L"],
      ["Nova coleção", "⌘⇧N"],
      ["Início · Planner · Links · Tags · Tarefas", "⌘1 … ⌘5"],
      ["Mostrar / ocultar a barra lateral", "⌘B"],
      ["Bloquear o Waypoint", "⌘⌥L"],
      ["Apresentar o plan aberto", "F5"],
      ["Atalhos de teclado", "F1"],
      ["Configurações", "⌘,"],
    ],
    tour: [],
  },
];

/** The module for a pathname (contextual help); desktop-only modules are never "current". */
export function helpModuleFor(pathname: string): HelpModule | undefined {
  return HELP_MODULES.find((m) => !m.desktopOnly && m.match.test(pathname));
}

export function helpModule(id: string): HelpModule | undefined {
  return HELP_MODULES.find((m) => m.id === id);
}

# Análise de desempenho do aplicativo desktop

Data: 13/10/2026. Escopo: análise e reprodução; nenhuma alteração funcional aplicada.

## Conclusão

Foi confirmada uma causa do atraso ao navegar: a transição de página anima a tela de carregamento e o conteúdo final só aparece depois de terminar essa animação. No executável instalado, remover apenas as animações das pseudoclasses de View Transition reduziu o intervalo entre clique e desaparecimento do carregamento de aproximadamente 320–336 ms para 28–35 ms.

Essa evidência explica o atraso constante na navegação. Não comprova a causa de eventuais travamentos de vários segundos ou de movimentos do desenho aos trancos: esses sintomas não foram reproduzidos nos testes com o documento local. Não se deve concluir que o problema completo foi resolvido ou que toda a lentidão tem uma única causa.

## Ambiente e método

- Executável real: `/Applications/Waypoint.app`, versão 0.1.0, ARM64 nativo.
- Electron 44.5.1, Chromium 152.0.7977.130; macOS 27.0 (26A428), Apple M4 Pro.
- O build instalado e o build preparado no projeto têm o mesmo identificador.
- O servidor empacotado usa Next.js 16.3.8 em modo de produção, iniciado em um utility process. Não é `next dev`.
- O banco original foi aberto apenas para leitura e copiado por snapshot SQLite para uma pasta temporária. Os testes modificaram somente essa cópia.
- Dados observados: um plan, um link, 11 elementos e seis conexões no documento. Isso exclui volume de dados como explicação suficiente para o caso observado.
- Também foi testada uma cópia temporária dos caches e preferências de renderização da instalação.
- Automação via Playwright/Electron, observação de eventos do renderer, PerformanceObserver, perfil de CPU e informações da GPU. Os números são de execuções locais, sem tratamento estatístico de múltiplas máquinas.

## Evidência causal da navegação

`src/app/(app)/template.tsx` envolve o conteúdo de cada página em um `<ViewTransition>` com a classe `wp-vt-page`. Em `src/app/globals.css:403–407`, a entrada dura 260 ms e tem atraso de 40 ms. Há telas `loading.tsx` dentro dessa navegação.

No teste normal, a ordem observada foi: clique → resposta RSC rápida → início da transição → URL/título atualizados e carregamento visível → término da transição cerca de 300 ms depois → carregamento removido.

O controle aplicou somente este CSS na janela temporária, sem mudar o executável, servidor, React, banco ou código do projeto:

```css
::view-transition-group(*),
::view-transition-old(*),
::view-transition-new(*) {
  animation: none !important;
}
```

| Destino | Resposta RSC, total | Clique → fim do carregamento, normal | Com animação desativada |
| --- | ---: | ---: | ---: |
| Planner | 4,4 ms | 331,5 ms | 31,4 ms |
| Links | 6,4 ms | 336,4 ms | 35,0 ms |
| Tags | 5,8 ms | 320,4 ms | 28,2 ms |
| Configurações | 7,8 ms | 326,3 ms | 33,9 ms |
| Início | 9,8 ms | 328,8 ms | 27,9 ms |

A mediana caiu de 328,8 ms para 31,4 ms, cerca de 90% de redução. Desativar estilos dos elementos com `*` não produziu essa melhora, pois não desativa as pseudoclasses de View Transition. Isso é relevante para não atribuir o resultado a sombras ou blur sem evidência.

Eventos brutos e método: [desktop-navigation-measurements.json](./desktop-navigation-measurements.json).

Correção indicada: retirar a transição de página da navegação desktop ou impedir que ela anime o fallback de carregamento. Uma alteração futura deve preservar os indicadores de carregamento e ser verificada medindo clique → conteúdo pronto, e não apenas a mudança de URL.

## Canvas e GPU

O editor abriu em aproximadamente 832 ms no teste inicial. Não foram observadas tarefas JavaScript acima de 50 ms durante a abertura e a interação automatizada. O perfil de CPU inicial teve aproximadamente 82% das amostras em idle; não mostrou um loop contínuo de JavaScript dominando a execução.

Na interação subsequente com caches/preferências copiados, os intervalos de `requestAnimationFrame` ficaram com mediana de 8,3 ms e percentil 95 de 8,7 ms, sem intervalo acima de 50 ms. Esses números são do callback de animação, não uma medição independente de quadros efetivamente apresentados na tela. Testes iniciais tiveram pausas isoladas de até 134 ms.

A configuração padrão reportou composição e rasterização aceleradas, ANGLE Metal e Skia Graphite. Não há evidência de execução via Rosetta ou de aceleração gráfica desativada no teste padrão.

Uma variante experimental com `--disable-features=SkiaGraphite` causou falhas da GPU no teste; ela foi descartada. Não é uma correção validada e não foi aplicada ao projeto nem à instalação.

Para explicar a lentidão extrema relatada, ainda é necessário capturar um perfil no intervalo em que ela ocorre. Os resultados obtidos não justificam afirmar incompatibilidade geral do M4, defeito do banco ou falha permanente da GPU.

## Gargalos de escala encontrados no código

São problemas concretos de estrutura, mas não foram demonstrados como causa do caso atual, cujo banco é pequeno:

1. `src/server/services/plans.ts:100–125`: `listPlans` lê o JSON completo de todos os documentos selecionados e calcula miniaturas na requisição, sem paginação. `recentPlans` chama essa listagem antes de limitar o resultado; `plansWithOpenThreads` chama a mesma listagem novamente na página inicial (`src/server/services/home.ts:11,37`). O custo cresce com a soma dos tamanhos dos desenhos, mesmo quando poucos cartões serão exibidos.
2. `src/features/planner/autosave.ts:145–156`: o debounce de 800 ms adia o envio ao servidor, mas a assinatura e o backup completo em `localStorage` são síncronos a cada notificação de alteração. O editor evita notificar durante o arraste comum de nós; alterações contínuas de outras propriedades podem continuar gerando esse custo.
3. `src/features/planner/editor.ts`, `onNodeDrag`: o documento dos nós é reconstruído para procurar containers de destino durante o movimento. É trabalho proporcional ao desenho no caminho de interação e merece medição com documentos grandes.

## Relatório de encerramento enviado durante a análise

O relatório registra `SIGABRT` em `HIServices._RegisterApplication`/AppKit, antes de carregar a aplicação, com o Codex/ChatGPT como processo responsável. O lançamento ocorreu às 22:30:41; o script do primeiro teste foi criado às 22:30:40 e sua execução restrita retornou `Process failed to launch`.

A correlação indica que esse relatório corresponde à primeira tentativa de automação no ambiente restrito. As execuções posteriores com permissão conseguiram iniciar o app. Esse encerramento não demonstra a causa da lentidão anterior de navegação ou desenho.

## Limites da análise

Não houve mudança funcional, rebuild, reinstalação, atualização de dependências ou alteração no banco original. A mudança pré-existente em `package-lock.json` foi preservada. Não foram executados testes unitários/build, pois não houve mudança de código; a validação foi feita no executável instalado e no controle temporário de transição.

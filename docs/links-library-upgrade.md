# Biblioteca de links — melhorias

Implementado em 13/10/2026.

- Menu próprio de botão direito nos links, compartilhando ações com o botão `⋯`. O menu preserva a seleção e apresenta operações para o conjunto selecionado. No espaço vazio há criação de link, colagem de URLs, criação de coleção, modos de visualização e ordenação.
- Seleção por checkbox, intervalo com Shift e seleção dos links carregados com ⌘/Ctrl+A. Clique normal continua abrindo o link. A barra de seleção inclui copiar URLs, mover, tags e arquivamento; Delete/Backspace arquiva a seleção. O menu mostra os atalhos disponíveis.
- Coleções podem ser movidas por menu, além do arraste existente. Destinos inválidos, como a própria coleção ou seus descendentes, ficam fora do seletor. O arraste mostra o destino e a quantidade de links. A reordenação manual movimenta toda a seleção como um bloco, com persistência transacional.
- Agrupamentos por domínio, primeira tag ou data. Cada link aparece uma vez. O agrupamento considera os links já carregados; a biblioteca mantém o carregamento paginado. Reordenação manual fica disponível quando todos os links do contexto estão carregados, sem filtros ou agrupamento.
- Cards sem grandes capas vazias quando não há imagem. Capas opcionais, densidade confortável/densa, domínio visível e lista com colunas configuráveis e largura ajustável por arraste ou teclado. As preferências de exibição, resumo e ordenação são pessoais por coleção/contexto.
- Busca, filtros, ordenação e visualização têm controles distintos. A posição de rolagem é lembrada por contexto. Troca de visualização e abertura dos detalhes usam estado local e histórico nativo, sem solicitar outra renderização da biblioteca no servidor.
- O painel lateral é o padrão dos detalhes e permite continuar usando a biblioteca. Título, URL, coleção, tags, descrição e notas são editáveis diretamente. A prévia do site só é verificada/carregada ao escolher sua aba. Há navegação anterior/próximo e acesso às opções avançadas de capa, ícone e abertura.
- Entrada de vários links por botão, colagem de várias linhas ou menu do espaço vazio. Até 100 URLs por lote, validação dos endereços e revisão de duplicados antes de salvar. A criação revalida acesso e duplicados, grava em transação e atualiza os índices pelo serviço existente. Coleção e tags podem ser aplicadas ao conjunto; há opção de desfazer arquivando os links criados.
- A busca opcional de metadados acontece em lotes de até 12, somente para os links novos daquela entrada, usando o endpoint existente com checagem de acesso e `safeFetch`. O trabalho pode ser interrompido pelo aviso de progresso. A movimentação e o arquivamento oferecem desfazer.
- Notificações ficam acima da barra de seleção, inclusive no celular.

## Validação

- Typecheck da aplicação e do desktop.
- 339 testes unitários, incluindo os novos casos de acesso, atomicidade, duplicados, indexação, agrupamento, preferências e ordem de seleções.
- Testes de navegador para revisão/importação em lote, edição lateral, menus individuais e múltiplos, tags, preferências, ajuste de largura, movimentação de coleções e atualização de metadados limitada aos novos IDs.
- Regressão de cadastro/autenticação, criação/edição/publicação de plan e busca global de links.
- Inspeção visual em claro, escuro e viewport de celular.
- Build standalone e pacote ARM64; teste no Electron com perfil/banco temporários, sem tocar os dados da instalação existente.

O pacote fica em `desktop/release/Waypoint-0.1.0-mac-arm64.zip`. O aplicativo instalado em `/Applications` não é substituído automaticamente.

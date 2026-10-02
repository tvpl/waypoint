# Salvar no Waypoint — extensão do navegador

Salve a página atual (ou qualquer link) na sua Link Library do Waypoint sem sair do que está fazendo: escolha a coleção, adicione tags e uma nota, e pronto. Se o link já estiver salvo, a extensão avisa e leva você até ele.

- **Popup** (ícone da barra ou <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> / <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>): título editável, coleção com busca (lembra a última usada), tags com sugestões, nota opcional. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva.
- **Menu de contexto:** botão direito em um link → *Salvar link no Waypoint*; em qualquer página → *Salvar página no Waypoint*.
- **Salvar direto:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> salva a aba atual na última coleção usada; o resultado aparece no selo do ícone (✓ ou !).
- **Nova aba:** cada nova aba mostra seu acesso rápido do Waypoint (links fixados e os que você mais abre — teclas <kbd>1</kbd>…<kbd>9</kbd>), uma busca na biblioteca que entende `tag:`, `site:`, `in:` e `is:` (<kbd>/</kbd> foca, <kbd>Enter</kbd> abre o primeiro resultado), os links abertos recentemente, seus plans e avisos de caixa de entrada e links quebrados. O navegador avisa na primeira vez que a extensão substitui a nova aba; é possível manter ou desativar.
- **Caixa de entrada:** links salvos **sem coleção** vão para a *Caixa de entrada* do Waypoint, para você organizar depois com a triagem por teclado. A nota vira o campo **Notas** do link.

Sem etapa de build: HTML, CSS e JavaScript puros (Manifest V3).

## Instalar

### Chrome / Edge / Brave

1. Abra `chrome://extensions` (no Edge, `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta `extension/`.
4. Fixe o ícone do Waypoint na barra de ferramentas (ícone de quebra-cabeça → alfinete).

### Firefox (128 ou superior)

1. Abra `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária…** e selecione o arquivo `extension/manifest.json`.
3. A extensão fica instalada até você fechar o Firefox (é assim para extensões não assinadas).

## Configurar

1. No Waypoint, vá em **Configurações → Tokens de API**, dê um nome (ex.: “Chrome — notebook”) e clique em **Criar token**. Copie o token na hora: ele não é exibido de novo.
2. A página de configurações da extensão abre sozinha na instalação (ou clique no ⚙ do popup). Informe:
   - **Endereço do Waypoint** — o mesmo que você abre no navegador, ex.: `https://waypoint.suaempresa.com` (ou `http://localhost:3000` em desenvolvimento);
   - **Token de API** — o `wp_…` que você copiou.
3. Clique em **Salvar e testar conexão** e autorize o acesso ao endereço do Waypoint quando o navegador pedir. Aparece “Conectado como …”.

Pronto. Se o seu papel no workspace for *viewer*, a extensão avisa que só é possível consultar.

## Segurança e privacidade

- O token fica em `chrome.storage.local`, somente neste navegador (nunca é sincronizado). **Desconectar** remove o token e a permissão de acesso ao site; revogue o token no Waypoint se não for mais usá-lo.
- A extensão só conversa com o endereço que você configurou, e só pede acesso a ele (`optional_host_permissions`). Permissões fixas: `activeTab` (ler título e URL da aba quando você aciona a extensão), `storage` e `contextMenus`. Ela não lê o conteúdo das páginas.
- As requisições usam `Authorization: Bearer` sem cookies. No servidor, o token é guardado apenas como hash e o CORS da API aceita só origens de extensões.

## Desenvolvimento

```
extension/
  manifest.json        Manifest V3 (Chrome service worker + Firefox background scripts)
  popup.html/css/js    fluxo de salvar
  options.html/css/js  endereço + token, teste de conexão
  newtab.html/css/js   nova aba: acesso rápido, busca e recentes (GET /api/v1/home)
  background.js        menu de contexto, atalho "salvar direto", selo do ícone
  lib/api.js           configurações e cliente da API /api/v1
  styles.css           tokens de design do Waypoint (claro/escuro via prefers-color-scheme)
  icons/               PNGs 16/32/48/128 gerados a partir do logo
  scripts/render-icons.mjs
```

Para regenerar os ícones (requer Playwright com Chromium):

```bash
node extension/scripts/render-icons.mjs
# ou, se o Playwright estiver em outro lugar:
PLAYWRIGHT_MODULE=/caminho/para/node_modules/playwright node extension/scripts/render-icons.mjs
```

Depois de editar os arquivos, clique em **Recarregar** no card da extensão em `chrome://extensions`. A API usada está documentada no README principal (seção “API & extensão”).

# Trilha Panda 5.15

Organizador pessoal de estudos em formato PWA, com cadastro de concursos, cronograma semanal, edital verticalizado, biblioteca de resumos por concurso, registro de sessões, desempenho, inventário e backup local.

## Mascote animado

O panda é um desenho vetorial (SVG) dentro do `index.html`, sem dependências externas. Ele é montado em camadas, cada uma com sua própria animação: corpo com respiração, cabeça com balanço próprio, braços, pernas, orelhas, olhos, acessórios e o indicador de pensamento. Por isso o movimento é composto por partes, e não por uma sequência de imagens.

Ao alimentar, ele ergue o bambu até a boca; ao descansar, fecha os olhos e mostra sinais de sono. Brincar e fazer carinho também têm poses próprias. Ao tocar em **👋 Acenar**, ele levanta, acena com o braço direito e volta a sentar, em uma única transição contínua.

O panda cresce em seis etapas de XP: o corpo fica mais robusto e, nas etapas avançadas, aparecem brilhos. Ao desbloquear acessórios estudando, ele equipa automaticamente a nova recompensa se o espaço estiver livre ou usando uma recompensa automática anterior. Itens escolhidos manualmente continuam sob controle da pessoa.

### Controlador de humores

Um único controlador (`pandaSetMood`) decide o humor do panda. Cada humor tem uma prioridade, e um humor de prioridade menor não interrompe outro de prioridade maior enquanto ele estiver ativo.

| Humor | Prioridade | Quando acontece |
|---|---|---|
| repouso | 0 | Estado padrão |
| atenção | 1 | O cursor se move sobre o painel |
| curiosidade e pensar | 2 | Entrada do cursor; ociosidade prolongada |
| transição | 3 | Levantar e sentar |
| interação | 4 | Alimentar, brincar, carinho, descanso e aceno |
| comemoração | 5 | Subir de estágio ou evoluir |

Ações do usuário são forçadas e sempre respondem. Alimentar, brincar, fazer carinho, descansar ou comemorar interrompe o aceno.

### Olhar, piscadas e orelhas

- O olhar segue o cursor. Cada pupila recebe o deslocamento normalizado pela posição do cursor em relação ao painel, com limite nas bordas.
- A posição do painel é medida ao entrar com o cursor, ao rolar a página, ao redimensionar a janela e ao trocar de tela. Entre esses eventos, a medida fica em cache.
- As piscadas são agendadas pelo script, a cada 2,4 a 5,6 s, às vezes em dobro. Não há laço infinito de pálpebra.
- Em repouso, de vez em quando, as orelhas tremem ou o panda entra no modo de pensar. A respiração e o balanço da cabeça são contínuos.

### Pausas

As animações param quando:

- o painel sai da tela (`IntersectionObserver`, classe `is-offscreen`);
- a aba fica oculta (`visibilitychange`, classe `page-hidden`);
- a área de desenvolvedor pausa as animações (classe `dev-paused`).

Nesses estados, o script não dispara piscadas nem tremores de orelha automáticos, e ignora o cursor.

### Movimento reduzido

Com `prefers-reduced-motion: reduce` ativado no sistema:

- o script não pisca, não treme as orelhas e não acena;
- o CSS encerra as animações contínuas no último quadro, então as poses aparecem paradas;
- as partículas ficam ocultas e o halo fica estático.

## Personalização do panda

Na tela **Meu Panda**, use **🎨 Personalizar** (ou o cartão *Personalizar o panda* no Inventário) para:

- dar um nome ao panda (até 20 caracteres), que aparece no título e nas falas;
- escolher a pelagem: Clássico (inicial), Noturno (200 XP), Café (450 XP) e Algodão-doce (800 XP);
- escolher o cenário: Noite estrelada (inicial), Bambuzal (100 XP), Oceano (300 XP), Biblioteca (600 XP) e Por do sol (1000 XP).

As cores são controladas por variáveis CSS no SVG, então novas pelagens exigem só um bloco de variáveis.

## Área de desenvolvedor

Ative em **Dados e configurações → Modo desenvolvedor**. Além dos controles do panda, a área permite cadastrar concursos, criar resumos e links para materiais hospedados, importar resumos em `.txt` ou `.md` e importar/exportar um catálogo JSON com concursos, edital e resumos. O catálogo não contém sessões de estudo nem dados do panda. Para PDF e outros arquivos, hospede-os em um serviço HTTPS e cadastre o link no resumo.

Ao sair da conta, o app limpa os dados da sessão em memória e volta à tela de entrada com a última conta selecionada. Uma sessão salva inválida é removida ao abrir o app.

O catálogo JSON pode ser compartilhado entre instalações. Importar atualiza os dados do concurso e os tópicos correspondentes, preservando sessões existentes e tópicos já marcados como concluídos. Resumos são combinados por identificador ou por disciplina e título.

**Venda e biblioteca online:** o cronograma pessoal continua guardado no navegador e usa PIN local. A página `materiais.html` é uma biblioteca separada com contas de servidor (e-mail e senha), sessões protegidas, arquivos privados no R2 e permissões por cliente. A área de desenvolvedor local não concede privilégios administrativos no servidor. Um administrador ativa a primeira conta usando um segredo configurado no Worker, publica os materiais e libera o acesso após confirmar cada pagamento. **A cobrança automática ainda não está integrada**: não anuncie checkout automático até configurar um provedor de pagamentos e validar seus webhooks. O catálogo JSON local continua disponível para concursos e resumos usados dentro do cronograma.

## Instalar e publicar

Publique os arquivos da raiz deste repositório em uma hospedagem HTTPS. O projeto não precisa de etapa de build. Depois, abra o endereço no navegador e use a opção de instalar o aplicativo.

Com Cloudflare Workers, crie o banco D1 `trilha-panda-auth`, aplique `schema.sql`, atualize `database_id` em `wrangler.jsonc` e configure o segredo `ADMIN_BOOTSTRAP_TOKEN` antes de publicar. O bucket privado `trilha-panda-materiais` precisa estar vinculado ao Worker pelo binding `MATERIALS`; não habilite acesso público no bucket. Configure `APP_ORIGIN` com o domínio real do app. Após a publicação, crie sua conta em `/materiais.html` e use o segredo administrativo uma única vez para ativar a administração. Guarde esse segredo fora do repositório. O `.assetsignore` deixa `testes/`, `worker.js`, `schema.sql` e configurações fora dos arquivos públicos.

## Dados e privacidade

Concursos, cronogramas, resumos e registros ficam no armazenamento local do navegador. Os resumos são separados do histórico de estudo e não geram XP. Use **Dados e configurações → Exportar backup** para guardar uma cópia e **Importar backup** para restaurá-la em outro navegador.

## Testes

Os testes ficam na pasta `testes/` e não são necessários para usar o app.

```bash
cd testes
npm install
npm test                  # seis suítes em jsdom
npm run test:navegador    # suíte em Chrome real
```

- `npm test` roda 160 verificações: `test.js` (visual salvo, estágio, nome e personalização), `test_dev.js` (área de desenvolvedor), `test_study.js` (sessões e validações), `test_login.js` (tela de login e contas locais), `test_wave.js` (aceno) e `test_panda.js` (humores, prioridades, olhar, piscadas, pausas, movimento reduzido e CSS).
- `npm run test:navegador` abre o Chrome sem janela, pelo DevTools Protocol, e faz 32 verificações que o jsdom não cobre: rolagem e IntersectionObserver reais, aba oculta, service worker e cache, instalação, piscadas e aceno em tempo real, e responsividade. Exige Node 22 ou superior e Chrome ou Chromium. Se o navegador não for encontrado, informe o caminho na variável `CHROME`, por exemplo `CHROME=/usr/bin/google-chrome npm run test:navegador`.

## Estrutura

- `index.html`: app completo (CSS, SVG do panda e script).
- `sw.js`: service worker, com cache `trilha-panda-shell-v5-15`.
- `manifest.webmanifest` e `panda-icon.svg`: instalação do PWA. O ícone é SVG.
- `icons/`: PNGs que não são referenciados pelo manifesto nem pelo HTML. Estão mantidos e podem ser removidos.
- `wrangler.jsonc` e `.assetsignore`: publicação em Cloudflare Workers.
- `testes/`: suítes de teste.

## Desenvolvimento

Sirva esta pasta por HTTP para testar o PWA e o service worker. Abrir o `index.html` diretamente permite conferir a interface, mas não ativa o service worker.

Ao publicar uma versão com mudanças nos arquivos da raiz, troque o nome do cache em `sw.js` (hoje `trilha-panda-shell-v5-15`), para que os navegadores baixem a versão nova.

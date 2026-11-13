# Trilha Panda 5.13

Organizador pessoal de estudos em formato PWA, com contas identificadas por usuário, senha protegida, sincronização dos estudos, cadastro de concursos, cronograma semanal, edital verticalizado, cursos com resumos e materiais, registro de sessões, desempenho, inventário e backup.

## Mascote animado

O panda é um desenho vetorial em camadas, integrado ao HTML e sem dependência de CDN. O rosto tem manchas oculares diagonais, olhos maiores, focinho arredondado e sorriso definido. Os braços se encontram à frente do corpo para segurar o bambu. Ao alimentar, ele ergue o bambu até a boca; ao descansar, fecha os olhos e mostra sinais de sono. Brincar e fazer carinho também acionam poses próprias. O movimento respeita a preferência de movimento reduzido do dispositivo.

O panda cresce em seis etapas de XP: o corpo fica mais robusto e, nas etapas avançadas, aparecem brilhos. Ao desbloquear acessórios estudando, ele equipa automaticamente a nova recompensa se o espaço estiver livre ou usando uma recompensa automática anterior. Itens escolhidos manualmente continuam sob controle da pessoa.

## Instalar e publicar

O Worker precisa do binding D1 `DB`, conforme `wrangler.jsonc`. Crie o banco, aplique `schema.sql` e configure o binding antes de publicar. O Worker entrega os arquivos estáticos e atende as rotas `/api/*` de conta, sincronização e materiais. Use HTTPS para que o cookie de sessão protegido funcione.

## Dados e privacidade

Cada conta tem seus próprios concursos, cronogramas, resumos, sessões e evolução do panda, sincronizados no banco da plataforma. A senha não é enviada em texto nem salva como texto: o navegador deriva uma prova protegida com PBKDF2 antes de autenticar. Links e anotações de materiais sincronizam com a conta. Arquivos anexados, de até 20 MB, ficam somente no armazenamento local do navegador usado para adicioná-los; eles não são enviados à nuvem, não aparecem em outros aparelhos e não entram no backup JSON. Resumos continuam separados do histórico e não geram XP. Use **Dados e configurações → Exportar backup** para guardar uma cópia dos dados de estudo.

Na primeira entrada em uma conta sem dados, o aplicativo pergunta se você quer importar os estudos que já estavam salvos neste navegador. A importação só acontece após você escolher **Importar para minha conta**. A senha de uma conta não pode ser recuperada pelo aplicativo; mantenha-a guardada.

## Desenvolvimento

Sirva esta pasta por HTTP com o binding D1 configurado e aplique `schema.sql` ao banco local ou de prévia. Os arquivos anexados são mantidos no IndexedDB do navegador. O projeto não usa bibliotecas externas no navegador.

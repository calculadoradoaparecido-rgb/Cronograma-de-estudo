# Trilha Panda 5.12

Organizador pessoal de estudos em formato PWA, com cadastro de concursos, cronograma semanal, edital verticalizado, biblioteca de resumos por concurso, registro de sessões, desempenho, inventário e backup local.

## Mascote animado

O panda é um desenho vetorial em camadas, integrado ao HTML e sem dependência de CDN. O rosto tem manchas oculares diagonais, olhos maiores, focinho arredondado e sorriso definido. Os braços se encontram à frente do corpo para segurar o bambu. Ao alimentar, ele ergue o bambu até a boca; ao descansar, fecha os olhos e mostra sinais de sono. Brincar e fazer carinho também acionam poses próprias. O movimento respeita a preferência de movimento reduzido do dispositivo.

O panda cresce em seis etapas de XP: o corpo fica mais robusto e, nas etapas avançadas, aparecem brilhos. Ao desbloquear acessórios estudando, ele equipa automaticamente a nova recompensa se o espaço estiver livre ou usando uma recompensa automática anterior. Itens escolhidos manualmente continuam sob controle da pessoa.

## Instalar e publicar

Publique os arquivos da raiz deste repositório em uma hospedagem HTTPS, como Cloudflare Pages. O projeto não precisa de etapa de build. Depois, abra o endereço no navegador e use a opção de instalar o aplicativo.

## Dados e privacidade

Concursos, cronogramas, resumos e registros ficam no armazenamento local do navegador. Os resumos são separados do histórico de estudo e não geram XP. Use **Dados e configurações → Exportar backup** para guardar uma cópia e **Importar backup** para restaurá-la em outro navegador.

## Desenvolvimento

Sirva esta pasta por HTTP para testar o PWA e o service worker. Abrir o `index.html` diretamente também permite conferir a interface, mas não ativa o service worker.

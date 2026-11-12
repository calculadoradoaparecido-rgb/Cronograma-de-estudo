# Trilha Panda 5.8

Organizador pessoal de estudos em formato PWA, com cadastro de concursos, cronograma semanal, edital verticalizado, registro de sessões, desempenho, inventário e backup local.

## Mascote animado

O panda é um desenho vetorial em camadas, integrado ao HTML e sem dependência de CDN. A ilustração agora segue um estilo mais clássico: panda sentado, pelo preto e creme, olhos grandes com brilho, patinhas rosadas e bambu entre os braços. Ele respira, pisca e movimenta os braços continuamente. Alimentar, brincar, fazer carinho e descansar acionam poses e mensagens específicas. O movimento respeita a preferência de movimento reduzido do dispositivo.

## Instalar e publicar

Publique os arquivos da raiz deste repositório em uma hospedagem HTTPS, como Cloudflare Pages. O projeto não precisa de etapa de build. Depois, abra o endereço no navegador e use a opção de instalar o aplicativo.

## Dados e privacidade

Concursos, cronogramas e registros ficam no armazenamento local do navegador. Use **Dados e configurações → Exportar backup** para guardar uma cópia e **Importar backup** para restaurá-la em outro navegador.

## Desenvolvimento

Sirva esta pasta por HTTP para testar o PWA e o service worker. Abrir o `index.html` diretamente também permite conferir a interface, mas não ativa o service worker.

# Ritmo — Cronograma de estudos para Android

Aplicativo web instalável (PWA), adaptado para celular Android. Não é um APK nativo: é instalado pelo Chrome depois de publicado em um endereço HTTPS.

## Recursos
- Cadastro, edição e exclusão de matérias, com cores e metas semanais.
- Cronograma semanal por dia, horário e duração.
- Cronômetro de foco de 15, 25 ou 50 minutos.
- Registro manual de sessões concluídas.
- Painel com horas do dia, horas da semana, sequência de dias e gráfico semanal.
- Histórico de estudos e exportação/importação de backup JSON.
- Armazenamento local no aparelho e suporte offline após a primeira abertura.

## Como instalar no Android
1. Publique todos os arquivos desta pasta em um serviço de hospedagem estática com HTTPS (por exemplo, Cloudflare Pages ou GitHub Pages).
2. Abra o endereço publicado no Google Chrome do Android.
3. Toque em **Instalar aplicativo** (quando aparecer) ou no menu ⋮ e escolha **Instalar app** / **Adicionar à tela inicial**.
4. Abra pelo ícone Ritmo. Depois da primeira carga, o app pode funcionar sem internet; os dados ficam no armazenamento local do navegador/aplicativo.

## Publicar gratuitamente no Cloudflare Pages
1. Extraia o ZIP e envie os arquivos da pasta `cronograma-estudos-android` para um repositório GitHub.
2. No Cloudflare, acesse **Workers & Pages → Create → Pages → Connect to Git**.
3. Selecione o repositório. Como é um site estático simples, deixe o comando de build vazio e informe `.` como diretório de saída. Isso indica a raiz do repositório.
4. Conclua a implantação e abra o endereço `*.pages.dev` no Chrome do Android.

## Privacidade e backup
Os registros são guardados no `localStorage` do aparelho e não são enviados a um servidor. Limpar os dados do navegador ou desinstalar/remover os dados do app pode apagar os registros. Use **Histórico → Exportar dados** para guardar uma cópia JSON e **Dados e ajustes → Importar backup** para restaurar.

## Desenvolvimento local
Sirva a pasta por HTTP em vez de abrir `index.html` diretamente, por exemplo:

```bash
python -m http.server 8080
```

Depois abra `http://localhost:8080` no navegador do computador. A instalação PWA em celular exige HTTPS (exceto localhost para testes).

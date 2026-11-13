// Teste em Chrome real (sem janela), pelo Chrome DevTools Protocol.
// Cobre o que o jsdom não consegue: rolagem e IntersectionObserver reais, aba oculta,
// service worker e cache, instalação, piscadas e aceno em tempo real, responsividade.
// Requisitos: Node 22 ou superior e Google Chrome ou Chromium instalado.
// Se o navegador não for encontrado, defina CHROME com o caminho do executável:
//   CHROME=/usr/bin/chromium node test_navegador.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || 'google-chrome';
const CACHE_ATUAL = 'trilha-panda-shell-v5-14';
const wait = ms => new Promise(r => setTimeout(r, ms));

const linhas = [];
let passou = 0, falhou = 0, naoVerificado = 0;
const ok = (cond, msg) => { if (cond) passou++; else falhou++; linhas.push((cond ? 'PASS ' : 'FAIL ') + msg); };
const pulado = msg => { naoVerificado++; linhas.push('SKIP ' + msg); };

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
};

// Servidor estático mínimo: o service worker só funciona em http://localhost ou https.
function servir() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (caminho.endsWith('/')) caminho += 'index.html';
      const arquivo = path.normalize(path.join(ROOT, caminho));
      if (!arquivo.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(arquivo, (erro, dados) => {
        if (erro) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(dados);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function json(porta, caminho, metodo = 'GET') {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo }, r => {
      let d = '';
      r.on('data', c => { d += c; });
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(d); } });
    });
    q.on('error', reject);
    q.end();
  });
}

function conectar(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pendentes = new Map(), ouvintes = [];
    let id = 0;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); }
      else ouvintes.forEach(f => f(m));
    };
    ws.onopen = () => resolve({
      enviar: (metodo, params = {}) => new Promise(r => {
        const i = ++id;
        pendentes.set(i, r);
        ws.send(JSON.stringify({ id: i, method: metodo, params }));
      }),
      ouvir: f => ouvintes.push(f),
      fechar: () => ws.close(),
    });
    ws.onerror = reject;
  });
}

async function verificar(cdp, base, porta, alvo) {
  const erros = [];
  cdp.ouvir(m => {
    if (m.method === 'Runtime.exceptionThrown') erros.push('exceção: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erros.push('console: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') erros.push('log: ' + m.params.entry.text + (m.params.entry.url ? ' ' + m.params.entry.url : ''));
  });
  const ev = async expr => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error('falha ao avaliar no navegador: ' + expr.slice(0, 80));
    return r.result.result.value;
  };
  const emCena = () => ev(`(function(){var s=document.querySelector('.panda-scene');var n=0;document.getAnimations().forEach(function(a){var t=a.effect&&a.effect.target;if(t&&s.contains(t)&&a.playState==='running')n++});return n})()`);
  const classeArte = c => ev(`document.getElementById('pandaArtwork').classList.contains('${c}')`);
  const classeCena = c => ev(`document.querySelector('.panda-scene').classList.contains('${c}')`);
  const esperar = async (fn, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(100); }
    return false;
  };

  // Conta de teste gravada antes da página carregar (PIN 1234, com o mesmo hash do app).
  const pin = crypto.createHash('sha256').update('sal1:1234').digest('hex');
  const contas = [{ id: 't1', name: 'Tester', salt: 'sal1', hash: pin, key: 'trilhaPandaUltimate_v5:t1', created: '2026-01-01T00:00:00.000Z' }];
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Page.enable');
  await cdp.enviar('Log.enable');
  await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trilhaPandaAccounts',${JSON.stringify(JSON.stringify(contas))});sessionStorage.setItem('trilhaPandaSession','t1')}catch(e){}` });
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
  await cdp.enviar('Page.navigate', { url: base + '/index.html' });
  await esperar(() => ev('document.readyState === "complete"'), 8000);
  await wait(800);

  // 1. Instalação: service worker, cache do shell e critérios de instalação
  const swAtivo = await ev(`Promise.race([navigator.serviceWorker.ready.then(function(r){return !!r.active}),new Promise(function(r){setTimeout(function(){r(false)},8000)})])`);
  ok(swAtivo === true, 'service worker registrado e ativo');
  const nomesCache = await ev(`caches.keys().then(function(k){return k.join(',')})`);
  ok(nomesCache === CACHE_ATUAL, `só o cache da versão atual existe (${nomesCache || 'nenhum'})`);
  const caminhos = (await ev(`caches.open('${CACHE_ATUAL}').then(function(c){return c.keys()}).then(function(r){return r.map(function(q){return new URL(q.url).pathname}).join(' ')})`)).split(' ');
  ok(['/', '/index.html', '/manifest.webmanifest', '/panda-icon.svg'].every(p => caminhos.includes(p)), 'shell do app em cache (index, manifest e ícone)');
  const instalacao = await cdp.enviar('Page.getInstallabilityErrors');
  if (instalacao.error) pulado('instalação: Page.getInstallabilityErrors não disponível nesta versão do navegador');
  else ok(instalacao.result.installabilityErrors.length === 0, 'o navegador considera o app instalável (manifest e ícone aceitos)');

  // 2. Animações visíveis e pausa fora da tela
  const emTela = await emCena();
  ok(emTela > 0, `painel visível: ${emTela} animações em execução`);
  await ev('window.scrollTo(0, 800)');
  ok(await esperar(() => classeCena('is-offscreen'), 2000), 'rolou para fora: o painel recebe a marca de pausa');
  ok((await emCena()) === 0, 'fora da tela: nenhuma animação do panda em execução');
  await ev('window.scrollTo(0, 0)');
  ok(await esperar(async () => !(await classeCena('is-offscreen')), 2000), 'voltou à tela: a marca de pausa sai');
  ok(await esperar(async () => (await emCena()) > 0, 2000), 'voltou à tela: as animações retomam');

  // 3. Ponteiro: curiosidade ao entrar, atenção ao se mover, olhar e retorno ao sair
  const area = await ev(`(function(){var r=document.getElementById('pandaArtwork').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()`);
  const mover = (x, y) => cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 });
  await mover(area[0] + area[2] * 0.9, area[1] + area[3] * 0.3);
  await wait(150);
  ok(await classeArte('mood-curiosity'), 'ponteiro entra no painel: humor de curiosidade');
  const olharDireita = parseFloat(await ev(`document.querySelector('#pandaArtwork .pupil').style.getPropertyValue('--look-x')||'NaN'`));
  ok(olharDireita > 0.2, `o olhar segue o ponteiro à direita (--look-x = ${olharDireita})`);
  // A curiosidade dura 1,1 s e tem prioridade sobre a atenção; depois o movimento contínuo ativa a atenção.
  for (let i = 0; i < 16; i++) {
    await mover(area[0] + area[2] * (0.85 - i * 0.02), area[1] + area[3] * 0.35);
    await wait(100);
  }
  ok(await classeArte('mood-attention'), 'ponteiro se movendo dentro do painel: humor de atenção');
  await mover(area[0] + area[2] * 0.08, area[1] + area[3] * 0.3);
  await wait(150);
  const olharEsquerda = parseFloat(await ev(`document.querySelector('#pandaArtwork .pupil').style.getPropertyValue('--look-x')||'NaN'`));
  ok(olharEsquerda < -0.2, `o olhar segue o ponteiro à esquerda (--look-x = ${olharEsquerda})`);
  const fora = await ev(`(function(){var r=document.querySelector('.panda-scene').getBoundingClientRect();var c=[[2,2],[innerWidth-2,innerHeight-2],[2,innerHeight-2],[innerWidth-2,2]];var p=c.find(function(q){return q[0]<r.left||q[0]>r.right||q[1]<r.top||q[1]>r.bottom});return p||null})()`);
  if (fora) {
    await mover(fora[0], fora[1]);
    await wait(150);
    ok(await ev(`[...document.querySelectorAll('#pandaArtwork .pupil')].every(p=>p.style.getPropertyValue('--look-x')==='')`), 'ponteiro sai do painel: o olhar volta ao centro nas duas pupilas');
  } else pulado('ponteiro fora do painel: não há canto livre nesta janela');

  // 4. Piscadas automáticas, em tempo real
  let piscadas = 0, antes = false;
  const inicio = Date.now();
  while (Date.now() - inicio < 6500) {
    const agora = await classeArte('is-blinking');
    if (agora && !antes) piscadas++;
    antes = agora;
    await wait(30);
  }
  ok(piscadas >= 1, `piscadas automáticas em 6,5 s: ${piscadas}`);

  // 5. Ação do usuário: pose de alimentação que termina sozinha
  await ev(`pandaCare('feed')`);
  await wait(200);
  ok(await classeArte('pose-feed'), 'alimentar: pose ativa');
  ok(await esperar(async () => !(await classeArte('pose-feed')), 4000), 'alimentar: a pose termina sozinha');

  // 6. Aceno: levanta, acena e volta a sentar
  await ev('startWave(1)');
  await wait(300);
  ok(await classeArte('is-standing'), 'aceno: o panda se levanta');
  await wait(800);
  ok(await classeArte('is-waving'), 'aceno: o braço direito está erguido');
  await wait(2300);
  ok(!(await classeArte('is-standing')) && !(await classeArte('is-waving')), 'aceno: o panda volta a sentar');

  // 7. Movimento reduzido (emulado no Chrome; equivale à preferência do sistema)
  await cdp.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await wait(400);
  ok(await ev(`matchMedia('(prefers-reduced-motion: reduce)').matches`), 'emulação de movimento reduzido ativa');
  ok(await esperar(async () => (await emCena()) === 0, 2000), 'movimento reduzido: nenhuma animação de repetição em execução');
  await ev('startWave(2)');
  await wait(250);
  ok(!(await classeArte('is-standing')), 'movimento reduzido: o panda não se levanta para acenar');
  ok(/não acena/.test(await ev(`document.getElementById('toast').textContent`)), 'movimento reduzido: aviso exibido');
  await cdp.enviar('Emulation.setEmulatedMedia', { features: [] });
  await wait(400);

  // 8. Aba oculta: pausa e retomada
  const nova = await json(porta, '/json/new?about:blank', 'PUT');
  await json(porta, `/json/activate/${nova.id}`);
  await wait(800);
  if (await ev('document.hidden')) {
    ok(await ev(`document.body.classList.contains('page-hidden')`), 'aba oculta: a página recebe a marca de pausa');
    ok(await esperar(async () => (await emCena()) === 0, 2000), 'aba oculta: nenhuma animação em execução');
  } else pulado('aba oculta: o navegador não ocultou a aba de teste neste ambiente');
  await json(porta, `/json/activate/${alvo.id}`);
  await wait(800);
  ok(await esperar(async () => !(await ev('document.hidden')) && (await emCena()) > 0, 3000), 'aba visível de novo: as animações retomam');
  await json(porta, `/json/close/${nova.id}`);

  // 9. Área de desenvolvedor: pausar e retomar
  await ev('devToggleAnim()');
  await wait(300);
  ok((await emCena()) === 0, 'área de desenvolvedor: animações pausadas');
  await ev('devToggleAnim()');
  await wait(300);
  ok((await emCena()) > 0, 'área de desenvolvedor: animações retomadas');

  // 10. Responsividade: celular e computador
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(500);
  const celular = await ev(`(function(){var r=document.getElementById('pandaArtwork').getBoundingClientRect();return {esq:r.left,dir:r.right,larg:r.width,vista:document.documentElement.clientWidth,rolagem:document.documentElement.scrollWidth}})()`);
  ok(celular.esq >= 0 && celular.dir <= celular.vista + 1 && celular.larg >= 0.5 * celular.vista,
    `celular 390 px: o panda cabe na tela e ocupa ${Math.round(100 * celular.larg / celular.vista)}% da largura`);
  ok(celular.rolagem <= celular.vista + 1, 'celular 390 px: sem rolagem horizontal');
  await cdp.enviar('Emulation.clearDeviceMetricsOverride');
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
  await wait(400);

  // 11. Erros de script, console e recursos ausentes
  ok(erros.length === 0, `sem erros de script, console ou recursos ausentes${erros.length ? ' (' + erros.slice(0, 3).join(' | ') + ')' : ''}`);
}

(async () => {
  const srv = await servir();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const porta = 9400 + Math.floor(Math.random() * 400);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'trilha-panda-'));
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1100,760',
    '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`];
  if (process.getuid && process.getuid() === 0) args.push('--no-sandbox');
  let falhaAoAbrir = null;
  const navegador = spawn(CHROME, [...args, 'about:blank'], { stdio: 'ignore' });
  navegador.on('error', e => { falhaAoAbrir = e; });
  let cdp = null, alvo = null, codigo = 0;
  try {
    let versao = null;
    for (let i = 0; i < 150 && !versao && !falhaAoAbrir; i++) {
      try { versao = await json(porta, '/json/version'); } catch (e) { await wait(200); }
    }
    if (!versao) {
      console.log(falhaAoAbrir ? `Não foi possível abrir o navegador "${CHROME}": ${falhaAoAbrir.message}` : 'O navegador não respondeu na porta de depuração.');
      console.log('Instale o Google Chrome ou o Chromium e, se preciso, defina CHROME com o caminho do executável.');
      codigo = 2;
    } else {
      alvo = (await json(porta, '/json/list')).find(t => t.type === 'page');
      cdp = await conectar(alvo.webSocketDebuggerUrl);
      await verificar(cdp, base, porta, alvo);
    }
  } catch (e) {
    linhas.push('ERRO durante o teste: ' + e.message);
    codigo = 1;
  } finally {
    if (cdp) cdp.fechar();
    navegador.kill('SIGTERM');
    await wait(300);
    try { navegador.kill('SIGKILL'); } catch (e) { /* já encerrado */ }
    srv.close();
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (e) { /* perfil temporário */ }
  }
  linhas.forEach(l => console.log(l));
  if (codigo === 0) {
    console.log(`\n${passou} passou(aram) · ${falhou} falhou(aram) · ${naoVerificado} não verificado(s) neste ambiente`);
    if (falhou) codigo = 1;
  }
  process.exitCode = codigo;
})();

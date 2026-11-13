// Controlador do panda: humores e prioridades, olhar que segue o cursor, piscadas, pausas (tela, aba, área dev),
// movimento reduzido, estrutura do SVG e do CSS (animações definidas, sem regra duplicada).
const {boot}=require('./harness.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
const moods=a=>[...a.classList].filter(c=>c.startsWith('mood-'));
const poses=a=>[...a.classList].filter(c=>c.startsWith('pose-'));
(async()=>{
 const errors=[];
 const w=await boot({errors,io:true});
 const d=w.document,art=d.getElementById('pandaArtwork'),scene=art.closest('.panda-scene');
 const moodIs=m=>moods(art).join()==='mood-'+m;

 // 1. arranque e estrutura do SVG
 ok(moodIs('rest')&&poses(art).length===0&&art.dataset.mood==='rest','arranque: humor de repouso, sem pose');
 ['ear-l','ear-r','eye-open-l','eye-open-r','pupil','head-bob','thought','eye-shape','sleep-eyes'].forEach(c=>
   ok(art.querySelector('.'+c),'SVG tem a parte .'+c));
 ok(art.querySelectorAll('.thought .dot').length===3,'indicador de pensamento tem 3 pontos');
 const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);
 ok(new Set(ids).size===ids.length,'ids da página são únicos');

 // 2. prioridades: ação do usuário responde; estado passivo não interrompe
 w.playMascotPose('feed');
 ok(moodIs('interaction')&&art.classList.contains('pose-feed'),'alimentar: humor interação + pose feed');
 const passivo=w.pandaSetMood('attention',{hold:500});
 ok(!passivo&&moodIs('interaction'),'atenção (passiva) não interrompe a interação');
 w.pandaSetMood('attention',{hold:500,force:true});
 ok(moodIs('attention')&&poses(art).length===0,'troca forçada remove a pose anterior');
 w.devMood('rest');

 // 3. uma classe de humor e no máximo uma pose a cada troca
 let exclusivo=true;
 for(const m of ['attention','curiosity','thinking','transition','interaction','celebration','rest']){
   w.pandaSetMood(m,{force:true,hold:200});
   exclusivo=exclusivo&&moods(art).length===1&&poses(art).length<=1;
 }
 ok(exclusivo,'sempre uma única classe mood-* e no máximo uma pose');
 w.devMood('rest');

 // 4. prazo: o humor volta ao repouso sozinho
 w.pandaSetMood('curiosity',{hold:60,force:true});
 await wait(120);
 ok(moodIs('rest'),'humor com prazo volta ao repouso sozinho');

 // 5. pose repetida reinicia sem acumular
 w.playMascotPose('pet');await wait(10);w.playMascotPose('pet');
 ok(art.classList.contains('pose-pet')&&poses(art).length===1,'pose repetida fica como uma única pose');
 w.devMood('rest');

 // 6. celebração tem prioridade sobre estados passivos
 w.playMascotPose('celebrate');
 ok(moodIs('celebration')&&art.classList.contains('pose-celebrate'),'comemorar: humor celebração');
 ok(!w.pandaSetMood('attention',{hold:300}),'durante a comemoração a atenção espera');
 w.devMood('rest');

 // 7. olhar que segue o cursor (dimensões simuladas, pois jsdom não faz layout)
 art.getBoundingClientRect=()=>({left:0,top:0,width:400,height:300});
 const pup=[...art.querySelectorAll('.pupil')];
 const move=(x,y)=>scene.dispatchEvent(Object.assign(new w.Event('pointermove'),{clientX:x,clientY:y}));
 scene.dispatchEvent(new w.Event('pointerenter'));
 ok(moodIs('curiosity'),'entrar na área do panda: curiosidade');
 move(300,75);await wait(40);
 ok(pup.length===2&&pup.every(p=>p.style.getPropertyValue('--look-x')==='0.50'&&p.style.getPropertyValue('--look-y')==='-0.22')&&art.style.getPropertyValue('--look-x')==='','olhar normalizado para o cursor (x 0.50, y -0.22) nas duas pupilas, sem reestilizar o painel');
 await wait(1200);
 move(20,290);await wait(40);
 ok(moodIs('attention'),'cursor em movimento depois da curiosidade: atenção');
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='-0.90'&&p.style.getPropertyValue('--look-y')==='1.00'),'olhar limitado às bordas (x -0.90, y 1.00) nas duas pupilas');
 // retângulo em cache: a nova medida só vale depois de rolagem ou de nova entrada do cursor
 art.getBoundingClientRect=()=>({left:100,top:0,width:400,height:300});
 move(300,75);await wait(40);
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='0.50'),'retângulo em cache: a medida anterior continua valendo até a rolagem');
 w.dispatchEvent(new w.Event('scroll'));
 move(300,75);await wait(40);
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='0.00'),'depois da rolagem a nova medida do painel é lida');
 scene.dispatchEvent(new w.Event('pointerleave'));
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')===''&&p.style.getPropertyValue('--look-y')===''),'ao sair da área o olhar volta ao centro nas duas pupilas');
 // invalidação do cache: nova entrada do cursor, redimensionamento e troca de tela forçam nova medida
 const medida=left=>{art.getBoundingClientRect=()=>({left,top:0,width:400,height:300})};
 medida(200);scene.dispatchEvent(new w.Event('pointerenter'));move(300,75);await wait(40);
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='-0.50'),'nova entrada do cursor mede o painel de novo');
 medida(0);move(300,75);await wait(40);
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='-0.50'),'sem evento, a medida em cache continua valendo');
 w.dispatchEvent(new w.Event('resize'));move(300,75);await wait(40);
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='0.50'),'redimensionamento força nova medida');
 medida(100);w.showPage('home');move(300,75);await wait(40);
 ok(pup.every(p=>p.style.getPropertyValue('--look-x')==='0.00'),'troca de tela força nova medida');
 w.devMood('rest');

 // 8. piscada: automática termina sozinha; dev força uma piscada
 w.pandaSetMood('attention',{force:true,hold:2000});
 w.devBlink();
 ok(art.classList.contains('is-blinking'),'piscar (botão dev) fecha os olhos');
 await wait(160);
 ok(!art.classList.contains('is-blinking'),'piscada termina sozinha');
 w.devMood('rest');

 // 9. fora da tela: sem mudança de humor, sem piscadas automáticas
 ok(w.__io&&w.__io.targets[0]===scene,'observador de interseção acompanha o painel');
 w.__io.cb([{isIntersecting:false}]);
 ok(scene.classList.contains('is-offscreen')&&w.eval('pandaState.onscreen')===false,'painel fora da tela: marcado como pausado');
 move(10,10);await wait(30);
 ok(moodIs('rest'),'fora da tela o cursor não muda o humor');
 w.pandaBlink();
 ok(!art.classList.contains('is-blinking'),'fora da tela não há piscada automática');
 w.__io.cb([{isIntersecting:true}]);
 ok(!scene.classList.contains('is-offscreen'),'voltou à tela: pausa removida');

 // 10. aba oculta pausa; ao voltar retoma
 Object.defineProperty(d,'hidden',{configurable:true,get:()=>true});
 d.dispatchEvent(new w.Event('visibilitychange'));
 ok(d.body.classList.contains('page-hidden'),'aba oculta: body marcado');
 w.pandaBlink();
 ok(!art.classList.contains('is-blinking'),'aba oculta: sem piscada automática');
 Object.defineProperty(d,'hidden',{configurable:true,get:()=>false});
 d.dispatchEvent(new w.Event('visibilitychange'));
 ok(!d.body.classList.contains('page-hidden'),'aba visível de novo: retomada');

 // 11. área dev com animações pausadas
 w.devToggleAnim();
 ok(d.body.classList.contains('dev-paused'),'pausar animações (dev) ativo');
 w.pandaBlink();
 ok(!art.classList.contains('is-blinking'),'animações pausadas: sem piscada automática');
 w.devToggleAnim();

 // 12. movimento reduzido: sem piscadas, sem orelhada automática; humores estáticos continuam
 w.matchMedia=()=>({matches:true});
 w.pandaBlink();w.pandaFlickEar();
 ok(!art.classList.contains('is-blinking')&&!art.classList.contains('ear-flick'),'movimento reduzido: sem piscada nem orelhada automáticas');
 w.devMood('attention');
 ok(moodIs('attention'),'movimento reduzido: o humor estático ainda muda');
 w.devMood('rest');
 w.matchMedia=()=>({matches:false});

 // 13. humores de teste na área dev
 ['attention','curiosity','thinking','rest'].forEach(m=>ok(d.querySelector(`button[onclick="devMood('${m}')"]`),'botão dev do humor '+m));
 ok(d.querySelector('button[onclick="devBlink()"]'),'botão dev piscar');
 w.devMood('thinking');
 ok(moodIs('thinking')&&art.dataset.mood==='thinking','pensar: humor thinking');
 w.devMood('rest');

 // 14. CSS: sem animação sem @keyframes, sem regra base duplicada, sem piscar antigo
 const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('\n');
 const defined=new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m=>m[1]));
 const keywords=new Set(['none','infinite','alternate','alternate-reverse','ease','ease-in','ease-out','ease-in-out','linear','forwards','backwards','both','reverse','normal','paused','running']);
 const usadas=new Set();
 for(const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g))
   for(const parte of m[1].split(',')) for(const t of parte.trim().split(/\s+/))
     if(/^[a-z][\w-]*$/i.test(t)&&!keywords.has(t))usadas.add(t);
 const sem=[...usadas].filter(n=>!defined.has(n));
 ok(sem.length===0,'toda animação usada tem @keyframes'+(sem.length?': faltam '+sem.join(', '):''));
 ok(!defined.has('panda-blink'),'piscada antiga em laço infinito removida');
 ok((css.match(/\.panda-artwork\{display:block/g)||[]).length===1,'regra base do painel declarada uma única vez');
 ok((css.match(/\.panda-artwork \.bamboo\{/g)||[]).length===1,'regra do bambu declarada uma única vez');
 ok(/\.panda-scene\.is-offscreen \*/.test(css)&&/\.dev-paused \.panda-scene \*/.test(css),'pausas (tela, aba e dev) cobrem o painel inteiro');

 ok(errors.length===0,'nenhum erro de console ou de script: '+errors.join(' | '));
 console.log(f?`\n${f} FAILED`:'\nALL PASSED');
 process.exit(f?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});

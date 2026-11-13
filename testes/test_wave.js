// Aceno do panda: levantar, acenar e sentar como uma única figura; cancelamento por outra ação; movimento reduzido.
const {boot}=require('./harness.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
(async()=>{
 const errors=[];
 const w=await boot({errors});const d=w.document;const art=d.getElementById('pandaArtwork');
 const has=c=>art.classList.contains(c);
 ok(!d.getElementById('pandaWalker'),'figura separada de caminhada removida (uma única figura)');
 ok(!has('is-standing')&&!has('is-waving'),'começa sentado');
 ok(d.querySelector('button[onclick="startWave(6)"]'),'botão Acenar ligado ao startWave');

 w.startWave(1.2);
 ok(has('is-standing')&&!has('is-waving')&&has('mood-transition'),'levanta primeiro (transição), sem braço erguido');
 await wait(800);
 ok(has('is-waving')&&has('is-standing')&&has('mood-interaction'),'acena depois de levantar');
 w.startWave(1.2);
 ok(w.eval('pandaState.waveTimers.length')===3,'segundo acionamento ignorado enquanto acena');
 await wait(1200);
 ok(!has('is-waving')&&!has('is-standing')&&has('mood-transition'),'abaixa o braço e começa a sentar (transição)');
 await wait(800);
 ok(!has('is-standing')&&!has('is-waving')&&has('mood-rest'),'sentado e de volta ao repouso');
 ok(w.eval('pandaState.waveTimers.length')===0,'temporizadores do aceno limpos ao final');

 w.startWave(5);w.stopWave();
 ok(!has('is-standing')&&!has('is-waving')&&w.eval('pandaState.waveTimers.length')===0,'stopWave encerra e senta na hora');

 w.startWave(5);await wait(800);
 w.playMascotPose('play');
 ok(!has('is-standing')&&!has('is-waving')&&has('pose-play')&&has('mood-interaction'),'pose durante o aceno: senta e toca só a pose de brincar');
 ok(w.eval('pandaState.waveTimers.length')===0,'aceno anterior cancelado (sem temporizador solto)');
 w.devMood('rest');

 const w2=await boot({errors});
 w2.matchMedia=()=>({matches:true});
 w2.startWave(5);
 const a2=w2.document.getElementById('pandaArtwork');
 ok(!a2.classList.contains('is-standing'),'movimento reduzido: não levanta nem acena');
 ok(/não acena/.test(w2.document.getElementById('toast').textContent),'movimento reduzido: aviso ao usuário');

 ok(errors.length===0,'nenhum erro de console durante o aceno: '+errors.join(' | '));
 console.log(f?`\n${f} FAILED`:'\nALL PASSED');
 process.exit(f?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});

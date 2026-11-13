// Ambiente de teste: carrega o index.html em jsdom (sem navegador real).
// Uso: const {boot,load}=require('./harness.js');  (rodar a partir da pasta testes/)
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs');const path=require('path');const {TextEncoder}=require('util');
const INDEX=path.join(__dirname,'..','index.html');
// opts: {legacy, accounts, session, keep, io: simula IntersectionObserver, errors: array que recebe erros da página}
function load(opts={}){
  const html=fs.readFileSync(INDEX,'utf8');
  const vc=new VirtualConsole().sendTo(console);
  vc.on('jsdomError',e=>{if(opts.errors)opts.errors.push('jsdom: '+(e.message||String(e)))});
  vc.on('error',(...a)=>{if(opts.errors)opts.errors.push('console.error: '+a.map(String).join(' '))});
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(win){
      win.crypto=globalThis.crypto; win.TextEncoder=TextEncoder;
      win.confirm=()=>true; win.scrollTo=()=>{};
      if(opts.io){
        // observador falso: guarda o callback para o teste disparar entrada/saída da tela
        win.IntersectionObserver=class{constructor(cb){win.__io={cb,targets:[]}}observe(el){win.__io.targets.push(el)}unobserve(){}disconnect(){}};
      }
      if(opts.legacy)win.localStorage.setItem('trilhaPandaUltimate_v5',JSON.stringify(opts.legacy));
      if(opts.accounts)win.localStorage.setItem('trilhaPandaAccounts',JSON.stringify(opts.accounts));
      if(opts.session){win.sessionStorage.setItem('trilhaPandaSession',opts.session);if(opts.keep)win.localStorage.setItem('trilhaPandaSession',opts.session)}
    }});
  return dom.window;
}
async function createAccount(w,name='Tester',pin='1234'){
  const d=w.document;
  d.getElementById('newName').value=name;d.getElementById('newPin').value=pin;d.getElementById('newPin2').value=pin;
  await w.createAccount({preventDefault(){}});
}
async function boot(opts={}){
  const w=load(opts);
  if(!opts.session && !opts.accounts) await createAccount(w);
  return w;
}
module.exports={load,boot,createAccount};

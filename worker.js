const SESSION_COOKIE = 'trilha_panda_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const MAX_DATA_BYTES = 1_000_000;
const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set(['pdf','doc','docx','ppt','pptx','xls','xlsx','csv','txt','png','jpg','jpeg','webp','mp3','mp4']);
const encoder = new TextEncoder();

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function error(message, status = 400) { return json({ error: message }, status); }
function randomBytes(size) { const value = new Uint8Array(size); crypto.getRandomValues(value); return value; }
function toHex(value) { return [...new Uint8Array(value)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function toBase64Url(bytes) { let binary = ''; for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
function fromBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { const raw = atob(value.replaceAll('-','+').replaceAll('_','/') + '='.repeat((4 - value.length % 4) % 4)); return Uint8Array.from(raw, c => c.charCodeAt(0)); } catch { return null; }
}
async function digest(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof message === 'string' ? encoder.encode(message) : message));
}
function sameBytes(a,b) { if (!a || !b || a.length !== b.length) return false; let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i]^b[i]; return diff===0; }
function xorBytes(a,b) { const out = new Uint8Array(a.length); for (let i=0;i<a.length;i++) out[i]=a[i]^b[i]; return out; }
function cookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) { const at=part.indexOf('='); if(at>0 && part.slice(0,at).trim()===name) return part.slice(at+1).trim(); }
  return '';
}
function cookieHeader(value, maxAge = SESSION_SECONDS) { return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
function originAllowed(request) { const origin=request.headers.get('Origin'); return !!origin && origin===new URL(request.url).origin; }
function normalizeUsername(value) { return String(value||'').trim().toLocaleLowerCase('en-US'); }
function validUsername(value) { return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value); }
function cleanFileName(value) { return String(value||'material').normalize('NFKC').replace(/[\\/\u0000-\u001f\u007f]/g,'_').replace(/[<>:"|?*]/g,'_').trim().slice(0,150) || 'material'; }
function validSource(value) {
  if (!value) return '';
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
async function readJson(request, maxBytes = 16_000) {
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>maxBytes) throw new Error('A solicitação está muito grande.');
  const text=await request.text();
  if(encoder.encode(text).length>maxBytes) throw new Error('A solicitação está muito grande.');
  return JSON.parse(text);
}
async function currentUser(request, env) {
  const token=cookieValue(request,SESSION_COOKIE); if(!token) return null;
  const tokenHash=toHex(await digest(encoder.encode(token)));
  return env.DB.prepare(`SELECT u.id,u.username,u.display_name AS displayName FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash,Math.floor(Date.now()/1000)).first();
}
async function createSession(userId, env) {
  const token=toBase64Url(randomBytes(32)),tokenHash=toHex(await digest(encoder.encode(token))),expires=Math.floor(Date.now()/1000)+SESSION_SECONDS;
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,userId,expires).run();
  return { token, expires };
}
function publicUser(row) { return { id:row.id, username:row.username, displayName:row.displayName }; }
async function api(request, env) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!env.DB) return error('O login ainda precisa ser conectado ao banco da plataforma.',503);
  if(!['GET','HEAD','OPTIONS'].includes(method) && !originAllowed(request)) return error('Origem da solicitação não permitida.',403);
  if(method==='GET' && path==='/api/auth/me') {
    const user=await currentUser(request,env); return json({user:user?publicUser(user):null});
  }
  if(method==='POST' && path==='/api/auth/register') {
    let body; try{body=await readJson(request)}catch{return error('Confira os dados do cadastro.');}
    const username=String(body.username||'').trim(),usernameNorm=normalizeUsername(username),displayName=String(body.displayName||'').trim();
    const salt=fromBase64Url(body.salt),storedKey=fromBase64Url(body.storedKey),serverKey=fromBase64Url(body.serverKey);
    if(!validUsername(usernameNorm)) return error('Use um usuário de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.');
    if(displayName.length<2 || displayName.length>60) return error('Informe um nome entre 2 e 60 caracteres.');
    if(!salt||salt.length!==16||!storedKey||storedKey.length!==32||!serverKey||serverKey.length!==32) return error('Não foi possível proteger a senha. Tente novamente.');
    const id=crypto.randomUUID();
    try {
      await env.DB.prepare('INSERT INTO users(id,username,username_norm,display_name,password_salt,stored_key,server_key) VALUES(?,?,?,?,?,?,?)').bind(id,username,usernameNorm,displayName,toHex(salt),toHex(storedKey),toHex(serverKey)).run();
    } catch { return error('Esse nome de usuário já está cadastrado.',409); }
    const session=await createSession(id,env);
    return json({user:{id,username,displayName}},201,{'Set-Cookie':cookieHeader(session.token)});
  }
  if(method==='POST' && path==='/api/auth/challenge') {
    let body; try{body=await readJson(request)}catch{return error('Informe seu usuário.');}
    const usernameNorm=normalizeUsername(body.username);
    if(!validUsername(usernameNorm)) return error('Informe um usuário válido.');
    const lock=await env.DB.prepare('SELECT failed_attempts,locked_until FROM login_locks WHERE username_norm=?').bind(usernameNorm).first();
    if(lock?.locked_until>Date.now()) return error('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.',429);
    const user=await env.DB.prepare('SELECT id,password_salt FROM users WHERE username_norm=?').bind(usernameNorm).first();
    const challengeId=crypto.randomUUID(),nonce=toBase64Url(randomBytes(32)),salt=user?.password_salt||toHex(randomBytes(16)),expires=Date.now()+5*60*1000;
    await env.DB.prepare('DELETE FROM login_challenges WHERE expires_at<?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO login_challenges(id,username_norm,nonce,salt,expires_at,user_id) VALUES(?,?,?,?,?,?)').bind(challengeId,usernameNorm,nonce,salt,expires,user?.id||null).run();
    return json({challengeId,nonce,salt:toBase64Url(Uint8Array.from(salt.match(/.{2}/g)||[],x=>parseInt(x,16)))});
  }
  if(method==='POST' && path==='/api/auth/verify') {
    let body; try{body=await readJson(request)}catch{return error('Não foi possível entrar. Confira usuário e senha.',401);}
    const challenge=await env.DB.prepare('SELECT * FROM login_challenges WHERE id=?').bind(String(body.challengeId||'')).first();
    if(!challenge || challenge.expires_at<Date.now()) return error('A tentativa expirou. Entre novamente.',401);
    await env.DB.prepare('DELETE FROM login_challenges WHERE id=?').bind(challenge.id).run();
    const user=challenge.user_id?await env.DB.prepare('SELECT id,username,display_name AS displayName,stored_key,server_key FROM users WHERE id=?').bind(challenge.user_id).first():null;
    const proof=fromBase64Url(body.proof),stored=user?Uint8Array.from(user.stored_key.match(/.{2}/g),x=>parseInt(x,16)):randomBytes(32);
    const message=`${challenge.id}.${challenge.nonce}.${challenge.username_norm}`;
    const signature=await hmac(stored,message);
    const clientKey=proof&&proof.length===32?xorBytes(proof,signature):randomBytes(32);
    const valid=user&&proof&&proof.length===32&&sameBytes(await digest(clientKey),stored);
    if(!valid) {
      const now=Date.now(),old=await env.DB.prepare('SELECT failed_attempts,locked_until FROM login_locks WHERE username_norm=?').bind(challenge.username_norm).first();
      const failed=(old?.locked_until&&old.locked_until<=now?0:Number(old?.failed_attempts)||0)+1,lockedUntil=failed>=5?now+15*60*1000:0;
      await env.DB.prepare('INSERT INTO login_locks(username_norm,failed_attempts,locked_until) VALUES(?,?,?) ON CONFLICT(username_norm) DO UPDATE SET failed_attempts=excluded.failed_attempts,locked_until=excluded.locked_until').bind(challenge.username_norm,failed,lockedUntil).run();
      return error(lockedUntil?'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.':'Usuário ou senha incorretos.',401);
    }
    await env.DB.prepare('DELETE FROM login_locks WHERE username_norm=?').bind(challenge.username_norm).run();
    const session=await createSession(user.id,env);
    const serverProof=toBase64Url(await hmac(Uint8Array.from(user.server_key.match(/.{2}/g),x=>parseInt(x,16)),message));
    return json({user:publicUser(user),serverProof},200,{'Set-Cookie':cookieHeader(session.token)});
  }
  if(method==='POST' && path==='/api/auth/logout') {
    const token=cookieValue(request,SESSION_COOKIE);
    if(token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(toHex(await digest(encoder.encode(token)))).run();
    return json({ok:true},200,{'Set-Cookie':cookieHeader('',0)});
  }

  const user=await currentUser(request,env);
  if(!user) return error('Sua sessão terminou. Entre novamente.',401);
  if(path==='/api/data' && method==='GET') {
    const row=await env.DB.prepare('SELECT data_json,updated_at FROM user_data WHERE user_id=?').bind(user.id).first();
    if(!row) return json({data:null});
    try{return json({data:JSON.parse(row.data_json),updatedAt:row.updated_at});}catch{return error('Os dados salvos não puderam ser lidos.',500);}
  }
  if(path==='/api/data' && method==='PUT') {
    let body,text; try{body=await readJson(request,MAX_DATA_BYTES);text=JSON.stringify(body.data)}catch{return error('Não foi possível guardar os dados.');}
    if(!body.data||!Array.isArray(body.data.contests)||!body.data.panda||encoder.encode(text).length>MAX_DATA_BYTES) return error('Os dados enviados não são válidos ou estão grandes demais.');
    await env.DB.prepare('INSERT INTO user_data(user_id,data_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP').bind(user.id,text).run();
    return json({ok:true,updatedAt:new Date().toISOString()});
  }
  if(path==='/api/materials' && method==='GET') {
    const contestId=String(url.searchParams.get('contestId')||'');
    const result=await env.DB.prepare("SELECT id,contest_id AS contestId,subject,title,note,source_url AS source,file_name AS fileName,file_size AS fileSize,CASE WHEN file_name<>'' AND object_key='' THEN 1 ELSE 0 END AS localOnly,created_at AS createdAt FROM materials WHERE user_id=? AND contest_id=? ORDER BY created_at DESC").bind(user.id,contestId).all();
    return json({materials:result.results||[]});
  }
  if(path==='/api/materials' && method==='POST') {
    const isJson=(request.headers.get('Content-Type')||'').includes('application/json');
    let meta,size=0,fileName='',objectKey='',fileBytes=null;
    if(isJson) {
      try{meta=await readJson(request,16_000)}catch{return error('Confira o material informado.');}
      if(meta.localFile===true) {
        fileName=cleanFileName(meta.fileName);size=Number(meta.fileSize)||0;
        const ext=fileName.split('.').pop().toLowerCase();
        if(!size||size>MAX_MATERIAL_BYTES)return error('O arquivo deve ter no máximo 20 MB.');
        if(!ALLOWED_FILE_EXTENSIONS.has(ext))return error('Formato não aceito. Envie PDF, Office, imagem, texto, MP3 ou MP4.');
      }
    } else {
      try{meta=JSON.parse(new TextDecoder().decode(fromBase64Url(request.headers.get('X-Material-Meta')||'')))}catch{return error('Os dados do arquivo não puderam ser lidos.');}
      const declaredSize=Number(request.headers.get('Content-Length')||0);fileName=cleanFileName(meta.fileName);
      const ext=fileName.split('.').pop().toLowerCase();
      if(declaredSize>MAX_MATERIAL_BYTES)return error('O arquivo deve ter no máximo 20 MB.');
      if(!ALLOWED_FILE_EXTENSIONS.has(ext))return error('Formato não aceito. Envie PDF, Office, imagem, texto, MP3 ou MP4.');
      if(!env.MATERIALS)return error('O armazenamento de arquivos ainda não está configurado.',503);
      fileBytes=await request.arrayBuffer();size=fileBytes.byteLength;
      if(!size||size>MAX_MATERIAL_BYTES)return error('O arquivo deve ter no máximo 20 MB.');
    }
    const contestId=String(meta.contestId||'').slice(0,100),subject=String(meta.subject||'').trim().slice(0,120),title=String(meta.title||'').trim().slice(0,160),note=String(meta.note||'').trim().slice(0,5000),source=validSource(String(meta.source||'').trim());
    if(!contestId||!subject||title.length<2)return error('Informe curso, disciplina e título.');
    if(source===null)return error('O link precisa começar com http:// ou https://.');
    if(!isJson&&!size)return error('Escolha um arquivo para anexar.');
    if(isJson&&!source&&!note&&!fileName)return error('Adicione um link, uma anotação ou anexe um arquivo.');
    const requestedId=String(meta.id||''),id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)?requestedId:crypto.randomUUID();
    if(!isJson){objectKey=`${user.id}/${id}`;await env.MATERIALS.put(objectKey,fileBytes,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'},customMetadata:{ownerId:user.id}});}
    try {
      await env.DB.prepare('INSERT INTO materials(id,user_id,contest_id,subject,title,note,source_url,file_name,file_size,object_key) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,contestId,subject,title,note,source||'',fileName,size,objectKey).run();
    } catch(e) { if(objectKey)await env.MATERIALS.delete(objectKey);throw e; }
    return json({ok:true,id},201);
  }
  if(path==='/api/materials' && method==='DELETE') {
    const contestId=String(url.searchParams.get('contestId')||'');
    const rows=contestId
      ? await env.DB.prepare('SELECT object_key FROM materials WHERE user_id=? AND contest_id=?').bind(user.id,contestId).all()
      : await env.DB.prepare('SELECT object_key FROM materials WHERE user_id=?').bind(user.id).all();
    const objects=(rows.results||[]).map(row=>row.object_key).filter(Boolean);
    if(objects.length&&!env.MATERIALS)return error('O armazenamento de arquivos não está configurado.',503);
    for(const key of objects)await env.MATERIALS.delete(key);
    if(contestId)await env.DB.prepare('DELETE FROM materials WHERE user_id=? AND contest_id=?').bind(user.id,contestId).run();
    else await env.DB.prepare('DELETE FROM materials WHERE user_id=?').bind(user.id).run();
    return json({ok:true,deleted:(rows.results||[]).length});
  }
  const downloadMatch=path.match(/^\/api\/materials\/([0-9a-f-]+)\/download$/i);
  if(downloadMatch&&method==='GET') {
    const material=await env.DB.prepare('SELECT file_name,object_key FROM materials WHERE id=? AND user_id=?').bind(downloadMatch[1],user.id).first();
    if(!material?.object_key)return error(material?.file_name?'Este arquivo está salvo somente no aparelho em que foi adicionado.':'Arquivo não encontrado.',404);
    const object=await env.MATERIALS.get(material.object_key);if(!object)return error('Arquivo não encontrado.',404);
    const safeName=cleanFileName(material.file_name),encoded=encodeURIComponent(safeName).replace(/['()]/g,escape).replace(/\*/g,'%2A');
    return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Content-Disposition':`attachment; filename="${safeName.replace(/["\\]/g,'_')}"; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  const deleteMatch=path.match(/^\/api\/materials\/([0-9a-f-]+)$/i);
  if(deleteMatch&&method==='DELETE') {
    const material=await env.DB.prepare('SELECT object_key FROM materials WHERE id=? AND user_id=?').bind(deleteMatch[1],user.id).first();
    if(!material)return error('Material não encontrado.',404);
    if(material.object_key)await env.MATERIALS.delete(material.object_key);
    await env.DB.prepare('DELETE FROM materials WHERE id=? AND user_id=?').bind(deleteMatch[1],user.id).run();
    return json({ok:true});
  }
  return error('Endereço não encontrado.',404);
}

export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url);
      if(url.pathname.startsWith('/api/')) return await api(request,env);
      return env.ASSETS.fetch(request);
    } catch(e) {
      console.error('Trilha Panda request failed:',e);
      return error('Não foi possível concluir a solicitação agora.',500);
    }
  }
};

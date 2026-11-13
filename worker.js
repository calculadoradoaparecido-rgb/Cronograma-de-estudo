const SESSION_DAYS = 30;
const SESSION_COOKIE = "tp_session";
const PBKDF2_ITERATIONS = 120000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function fail(message, status = 400) { return json({ error: message }, status); }
function emailNorm(value) { return String(value || "").trim().toLowerCase(); }
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function unb64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function sha256(value) { return b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, 256);
  return { salt: b64(salt), hash: b64(result) };
}
async function passwordMatches(password, user) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(user.password_salt), iterations: user.password_iterations, hash: "SHA-256" }, material, 256));
  const expected = unb64(user.password_hash);
  return result.length === expected.length && result.every((v, i) => v === expected[i]);
}
function cookieValue(request, name) {
  return (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}
function cookieHeader(token, maxAge) { return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function clearCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function validOrigin(request, env) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(env.APP_ORIGIN || request.url).origin;
}
async function currentUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.role,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash, Date.now()).first();
}
function isAdmin(user) { return user?.role === "admin"; }
async function requireUser(request, env) { return currentUser(request, env); }
async function requireAdmin(request, env) { const user = await requireUser(request, env); return isAdmin(user) ? user : null; }

let schemaPromise;
async function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,display_name TEXT NOT NULL,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,password_iterations INTEGER NOT NULL,role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),created_at INTEGER NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS sessions_token_expiry ON sessions(token_hash,expires_at)`,
        `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL COLLATE NOCASE,created_at INTEGER NOT NULL,succeeded INTEGER NOT NULL DEFAULT 0)`,
        `CREATE INDEX IF NOT EXISTS login_attempts_rate ON login_attempts(email,created_at,succeeded)`,
        `CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY,title TEXT NOT NULL,subject TEXT NOT NULL,exam TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',filename TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,access_level TEXT NOT NULL CHECK (access_level IN ('free','paid')),status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','archived')),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS materials_visibility ON materials(status,created_at)`,
        `CREATE TABLE IF NOT EXISTS material_entitlements (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,granted_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,revoked_at INTEGER,UNIQUE (user_id,material_id))`
      ];
      for (const statement of statements) await env.DB.prepare(statement).run();
    })().catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

async function newSession(userId, env) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = b64(tokenBytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, await sha256(token), expires, Date.now()).run();
  return token;
}
async function handleAuth(request, url, env) {
  if (request.method !== "GET" && !validOrigin(request, env)) return fail("Origem não permitida.", 403);
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await currentUser(request, env);
    return json({ user: user ? { id: user.id, email: user.email, name: user.display_name, role: user.role } : null });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await request.json().catch(() => null);
    const email = emailNorm(body?.email), name = String(body?.name || "").trim().slice(0, 80), password = String(body?.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || password.length < 12 || password.length > 200) return fail("Informe nome, e-mail válido e senha com pelo menos 12 caracteres.");
    const hashed = await passwordHash(password), id = crypto.randomUUID(), now = Date.now();
    try {
      await env.DB.prepare("INSERT INTO users (id,email,display_name,password_salt,password_hash,password_iterations,role,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, email, name, hashed.salt, hashed.hash, PBKDF2_ITERATIONS, "customer", now).run();
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || error))) return fail("Já existe uma conta com este e-mail. Tente entrar com ele.", 409);
      console.error("Falha ao criar conta na biblioteca:", error);
      return fail("Não foi possível criar sua conta agora. Tente novamente em instantes.", 500);
    }
    const token = await newSession(id, env);
    return json({ user: { id, email, name, role: "customer" } }, 201, { "set-cookie": cookieHeader(token, SESSION_DAYS * 86400) });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await request.json().catch(() => null), email = emailNorm(body?.email), password = String(body?.password || "");
    if (!email || !password) return fail("Informe e-mail e senha.");
    const now = Date.now(), since = now - 15 * 60 * 1000;
    const attempts = await env.DB.prepare("SELECT COUNT(*) AS total FROM login_attempts WHERE email=? AND created_at>? AND succeeded=0").bind(email, since).first();
    if ((attempts?.total || 0) >= 8) return fail("Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.", 429);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
    const ok = user && await passwordMatches(password, user);
    await env.DB.prepare("INSERT INTO login_attempts (email,created_at,succeeded) VALUES (?,?,?)").bind(email, now, ok ? 1 : 0).run();
    if (!ok) return fail("E-mail ou senha incorretos.", 401);
    const token = await newSession(user.id, env);
    return json({ user: { id: user.id, email: user.email, name: user.display_name, role: user.role } }, 200, { "set-cookie": cookieHeader(token, SESSION_DAYS * 86400) });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }
  return fail("Não encontrado.", 404);
}
async function handleMaterials(request, url, env) {
  const user = await currentUser(request, env);
  if (request.method === "POST" && url.pathname === "/api/admin/bootstrap") {
    if (!validOrigin(request, env)) return fail("Origem não permitida.", 403);
    if (!user) return fail("Entre na sua conta para configurar a administração.", 401);
    if (!env.ADMIN_BOOTSTRAP_TOKEN) return fail("A configuração administrativa ainda não foi habilitada no servidor.", 503);
    const body = await request.json().catch(() => null);
    const tokenValue = String(body?.token || "");
    if (tokenValue.length > 512) return fail("Código administrativo inválido.", 403);
    const supplied = new TextEncoder().encode(tokenValue);
    const expected = new TextEncoder().encode(env.ADMIN_BOOTSTRAP_TOKEN);
    let diff = supplied.length ^ expected.length;
    for (let i = 0; i < Math.max(supplied.length, expected.length); i++) diff |= (supplied[i] || 0) ^ (expected[i] || 0);
    if (diff !== 0) return fail("Código administrativo incorreto.", 403);
    const result = await env.DB.prepare("UPDATE users SET role='admin' WHERE id=? AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin')").bind(user.id).run();
    if (!result.meta?.changes) return fail("A administração já foi configurada.", 409);
    return json({ ok: true, user: { id: user.id, email: user.email, name: user.display_name, role: "admin" } });
  }
  if (request.method === "GET" && url.pathname === "/api/materials") {
    const rows = await env.DB.prepare(`SELECT m.id,m.title,m.subject,m.exam,m.description,m.mime_type,m.size_bytes,m.access_level,m.created_at,
      CASE WHEN m.access_level='free' OR ?='admin' OR EXISTS(SELECT 1 FROM material_entitlements e WHERE e.user_id=? AND e.material_id=m.id AND e.revoked_at IS NULL) THEN 1 ELSE 0 END AS can_access
      FROM materials m WHERE m.status='published' ORDER BY m.created_at DESC`).bind(user?.role || "", user?.id || "").all();
    return json({ materials: rows.results || [] });
  }
  const match = url.pathname.match(/^\/api\/materials\/([\w-]+)$/);
  if (request.method === "GET" && match) {
    const material = await env.DB.prepare("SELECT * FROM materials WHERE id=? AND status='published'").bind(match[1]).first();
    if (!material) return fail("Material não encontrado.", 404);
    const entitled = material.access_level === "free" || isAdmin(user) || (user && await env.DB.prepare("SELECT 1 FROM material_entitlements WHERE user_id=? AND material_id=? AND revoked_at IS NULL").bind(user.id, material.id).first());
    if (!entitled) return fail(user ? "Este material requer acesso liberado." : "Entre na sua conta para acessar este material.", 403);
    const object = await env.MATERIALS.get(material.object_key);
    if (!object) return fail("Arquivo indisponível.", 404);
    const headers = new Headers({ "content-type": material.mime_type, "content-length": String(material.size_bytes), "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(material.filename)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'self'" });
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  }
  if (request.method === "POST" && url.pathname === "/api/admin/materials") {
    if (!isAdmin(user) || !validOrigin(request, env)) return fail("Acesso administrativo necessário.", 403);
    const form = await request.formData(), file = form.get("file");
    const title = String(form.get("title") || "").trim().slice(0, 180), subject = String(form.get("subject") || "").trim().slice(0, 120), exam = String(form.get("exam") || "").trim().slice(0, 120), description = String(form.get("description") || "").trim().slice(0, 500), access = String(form.get("access") || "paid");
    if (!(file instanceof File) || !title || !subject || !exam || file.size < 1 || file.size > MAX_UPLOAD_BYTES) return fail("Preencha os campos e use um arquivo de até 50 MB.");
    const mime = ALLOWED_TYPES.has(file.type) ? file.type : "application/octet-stream";
    if (mime === "application/octet-stream") return fail("Formato não permitido. Envie PDF, TXT, Markdown, DOCX ou PPTX.");
    const id = crypto.randomUUID(), key = `materials/${id}`, now = Date.now();
    await env.MATERIALS.put(key, file.stream(), { httpMetadata: { contentType: mime } });
    try {
      await env.DB.prepare("INSERT INTO materials (id,title,subject,exam,description,filename,object_key,mime_type,size_bytes,access_level,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, title, subject, exam, description, file.name.slice(0, 200), key, mime, file.size, access === "free" ? "free" : "paid", "published", user.id, now).run();
    } catch (error) { await env.MATERIALS.delete(key); throw error; }
    return json({ id, title }, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/admin/entitlements") {
    if (!isAdmin(user) || !validOrigin(request, env)) return fail("Acesso administrativo necessário.", 403);
    const body = await request.json().catch(() => null), email = emailNorm(body?.email), materialId = String(body?.materialId || "");
    const target = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    const material = await env.DB.prepare("SELECT id FROM materials WHERE id=?").bind(materialId).first();
    if (!target || !material) return fail("Conta ou material não encontrado.", 404);
    await env.DB.prepare("INSERT INTO material_entitlements (id,user_id,material_id,granted_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,material_id) DO UPDATE SET revoked_at=NULL,granted_by=excluded.granted_by,created_at=excluded.created_at")
      .bind(crypto.randomUUID(), target.id, material.id, user.id, Date.now()).run();
    return json({ ok: true });
  }
  if (request.method === "DELETE" && match) {
    if (!isAdmin(user) || !validOrigin(request, env)) return fail("Acesso administrativo necessário.", 403);
    const item = await env.DB.prepare("SELECT object_key FROM materials WHERE id=?").bind(match[1]).first();
    if (!item) return fail("Material não encontrado.", 404);
    await env.DB.prepare("UPDATE materials SET status='archived' WHERE id=?").bind(match[1]).run();
    await env.MATERIALS.delete(item.object_key);
    return json({ ok: true });
  }
  return fail("Não encontrado.", 404);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) await ensureSchema(env);
      if (url.pathname.startsWith("/api/auth/")) return await handleAuth(request, url, env);
      if (url.pathname.startsWith("/api/materials") || url.pathname.startsWith("/api/admin/")) return await handleMaterials(request, url, env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Erro inesperado na biblioteca:", request.method, url.pathname, error);
      return fail("O servidor não conseguiu concluir a ação. Se era um cadastro, tente entrar com o mesmo e-mail e senha; a conta pode ter sido gravada.", 500);
    }
  }
};

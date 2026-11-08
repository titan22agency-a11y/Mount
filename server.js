// MOUNT store: site + owner dashboard + feedback page, with a real database.
// No npm dependencies: Node 22+ built-ins only (http, crypto, fs, node:sqlite).
//   node server.js                                  start the server (PORT, MOUNT_DATA)
//   node server.js set-user <user> <role> <name>    create/reset a user, prints the password
//   node server.js backup <dir>                     write a dated copy of the database (keeps the last 30)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');

const DATA = process.env.MOUNT_DATA || path.join(__dirname, '.data');
const PORT = Number(process.env.PORT || 3201);
const PUBLIC = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
const PRIVATE = new Set(['server.js', 'mount-setup.sh']);fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'mount.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, name TEXT NOT NULL, style TEXT NOT NULL, color TEXT NOT NULL, hex TEXT, price INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, sizes TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, img TEXT, gallery TEXT NOT NULL DEFAULT '[]', sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, seq INTEGER NOT NULL, created TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY, created TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sent(key TEXT PRIMARY KEY, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, username TEXT, action TEXT NOT NULL, detail TEXT);`);

const now = () => new Date().toISOString();
function kvGet(k, d) { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; }
function kvSet(k, v) { db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v)); }
function audit(user, action, detail) { db.prepare('INSERT INTO audit(at,username,action,detail) VALUES(?,?,?,?)').run(now(), user || null, action, detail ? JSON.stringify(detail).slice(0, 2000) : null); }

// ---------- first-run defaults
// No fake data: prices and stock start at 0, so nothing can be ordered until the owner sets them in the dashboard.
// Each row is one style in one colour. Stock is kept per size: [["S",0],["M",0],...].
if (!db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO products(id,name,style,color,hex,price,stock,sizes,active,img,gallery,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const sizes = JSON.stringify([['S', 0], ['M', 0], ['L', 0], ['XL', 0]]);
  ins.run('wburgundy', 'Sculpted Wide-Leg Sweatpants', 'women', 'Burgundy', '#5B1F2C', 0, 0, sizes, 1, 'w-model.webp',
    JSON.stringify(['w-model.webp', 'w-front.webp', 'w-back.webp', 'w-waist.webp', 'w-pocket.webp', 'w-panel.webp', 'w-logo.webp', 'w-fabric.webp']), 1);
  ins.run('wgrey', 'Sculpted Wide-Leg Sweatpants', 'women', 'Light Grey', '#BDBDBD', 0, 0, sizes, 1, '', '[]', 2);
  ins.run('mgrey', 'Wide-Leg Sweatpants', 'men', 'Heather Grey', '#A9A9A9', 0, 0, sizes, 1, 'm-front.webp',
    JSON.stringify(['m-front.webp', 'm-back.webp', 'm-side.webp', 'm-logo.webp', 'm-label.webp']), 3);
}
const DEFAULT_CONTENT = {
  ann: ['Free shipping on orders over [EGP AMOUNT]', 'Pay cash on delivery', 'New: Sculpted Wide-Leg Sweatpants'],
  heroTitle: 'Comfort should\nlook good.',
  heroBody: 'Wide-leg sweatpants for women and men, cut clean and finished with an embroidered MOUNT logo.',
  heroCta: 'Shop now', freeShip: 0, shipFee: 0, whatsapp: ''
};
// Follow-up timing for clothing (see the dashboard's "إعدادات المتابعة" page for the reasoning):
// day 2 fit check and day 7 first impression both land inside the 14-day exchange window;
// day 30 asks about quality after real wear and several washes.
const DEFAULT_SETTINGS = {
  dFit: 2, dFirst: 7, dResult: 30, dReorder: '',
  msgFit: 'أهلًا {name}، معاك فريق MOUNT. أوردر {order} وصل؟ والمقاس مظبوط؟ لو المقاس محتاج يتغيّر، رسالة هنا كفاية ونرتّب التبديل.',
  msgFirst: 'أهلًا {name}، عدّى أسبوع على أوردر {order}. رأيك في أول انطباع بياخد أقل من دقيقة: {link}',
  msgResult: 'أهلًا {name}، بقالك شهر مع MOUNT، يعني لبس وغسيل كذا مرة. إيه رأيك في الخامة والراحة دلوقتي؟ {link}',
  msgReorder: 'أهلًا {name}، معاك MOUNT. نبعتلك صور الألوان والموديلات المتاحة دلوقتي؟',
  msgRecover: 'أهلًا {name}، شفنا تقييمك لأوردر {order} وآسفين إن التجربة مكانتش على قد توقعاتك. ممكن نكلمك نفهم حصل إيه ونحلها؟'
};
const content = () => Object.assign({}, DEFAULT_CONTENT, kvGet('content', {}));
const settings = () => Object.assign({}, DEFAULT_SETTINGS, kvGet('settings', {}));

// ---------- passwords & sessions
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function setUser(username, role, name) {
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new Error('username: 2-32 chars a-z 0-9 . _ -');  if (!['admin', 'staff', 'viewer'].includes(role)) throw new Error('role: admin | staff | viewer');
  const pw = crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(`INSERT INTO users(username,name,role,salt,hash,created) VALUES(?,?,?,?,?,?)
    ON CONFLICT(username) DO UPDATE SET name=excluded.name, role=excluded.role, salt=excluded.salt, hash=excluded.hash`).run(username, name || username, role, salt, hashPw(pw, salt), now());
  db.prepare('DELETE FROM sessions WHERE username=?').run(username);
  return pw;
}
function checkPw(username, pw) {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) { hashPw(pw, 'x'.repeat(32)); return null; } // same work either way, so timing doesn't reveal which usernames exist
  const a = Buffer.from(hashPw(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? u : null;
}
const SESSION_DAYS = 14;
const COOKIE = 'mount_s';
const cookieRe = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})');
function newSession(username) {
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,username,expires) VALUES(?,?,?)').run(t, username, Date.now() + SESSION_DAYS * 864e5);
  return t;
}
function userFrom(req) {
  const m = cookieRe.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  return db.prepare('SELECT username,name,role FROM users WHERE username=?').get(s.username) || null;
}
// Expired sessions are useless, so delete them at startup and every hour.
const purgeSessions = () => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
purgeSessions();
setInterval(purgeSessions, 36e5).unref();

// ---------- feedback link tokens
// A random secret, created once and kept in the database. Feedback links carry
// HMAC(secret, orderId), so only someone who received the real link can send feedback for that order.
let FB_SECRET = kvGet('fbSecret', null);
if (!FB_SECRET) { FB_SECRET = crypto.randomBytes(32).toString('hex'); kvSet('fbSecret', FB_SECRET); }
const fbToken = orderId => crypto.createHmac('sha256', FB_SECRET).update(orderId).digest('base64url').slice(0, 22);
function fbTokenOk(orderId, token) {
  const a = Buffer.from(fbToken(orderId)), b = Buffer.from(String(token || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- tiny rate limiter (per IP, in memory)
const hits = new Map();
const MAX_KEYS = 20000; // hard cap so a flood of different keys can't fill the server's memory
function limited(key, max, ms) {
  const t = Date.now(), arr = (hits.get(key) || []).filter(x => t - x < ms);
  arr.push(t);
  hits.delete(key); hits.set(key, arr); // re-insert so the Map stays ordered oldest → newest
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value);
  return arr.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.some(x => t - x < 36e5)) hits.delete(k); }, 6e5).unref();

// ---------- helpers
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(body) }, headers || {}));
  res.end(body);
}
const httpErr = (code, msg) => Object.assign(new Error(msg), { code });
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return reject(httpErr(415, 'json only'));
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(httpErr(413, 'too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); resolve(v && typeof v === 'object' ? v : {}); } catch { reject(httpErr(400, 'bad json')); } });
    req.on('error', reject);
  });
}
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
// Who is the real visitor? Path of a request: visitor → Cloudflare → Caddy → this app.
// - Cloudflare puts the visitor's IP in CF-Connecting-IP.
// - Otherwise use the LAST X-Forwarded-For entry: that one was added by our own proxy (Caddy).
//   The FIRST entry is whatever the visitor typed, so trusting it would let anyone dodge the rate limits.
// Set MOUNT_TRUST_CF=0 if the site is ever served without Cloudflare in front.
const TRUST_CF = process.env.MOUNT_TRUST_CF !== '0';
function ipOf(req) {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (TRUST_CF && net.isIP(cf)) return cf;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const last = xff[xff.length - 1];
  return last && net.isIP(last) ? last : req.socket.remoteAddress;
}
const GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'مطروح', 'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد'];
const STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'returned', 'cancelled'];
const REASONS = ['المقاس', 'الخامة', 'التقفيل والخياطة', 'اللون مختلف عن الصور', 'بعد الغسيل', 'التوصيل', 'التغليف', 'السعر', 'خدمة العملاء'];
const FITS = ['small', 'right', 'large'];
const FU_TYPES = ['fit', 'first', 'result', 'reorder'];
const ORDER_RE = /^MT-\d{4,9}$/;
const getOrder = id => { const r = db.prepare('SELECT data FROM orders WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
const putOrder = o => db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(o), o.id);
const rowOut = p => Object.assign({}, p, { active: !!p.active, sizes: JSON.parse(p.sizes), gallery: JSON.parse(p.gallery) });
const allProducts = () => db.prepare('SELECT * FROM products ORDER BY sort,id').all().map(rowOut);
const getProduct = id => db.prepare('SELECT * FROM products WHERE id=?').get(id);
// Change the stock of one size of one product. Must run inside a transaction.
function moveStock(pid, size, delta) {
  const pr = getProduct(pid);
  if (!pr) return; // product was removed: nothing to give back
  const sizes = JSON.parse(pr.sizes), row = sizes.find(s => s[0] === size);
  if (!row) { if (delta > 0) sizes.push([size, delta]); else throw httpErr(409, 'المقاس ده مش موجود في المنتج'); }
  else {
    if (row[1] + delta < 0) throw httpErr(409, 'not enough stock');
    row[1] += delta;
  }
  db.prepare('UPDATE products SET sizes=?, stock=? WHERE id=?').run(JSON.stringify(sizes), sizes.reduce((a, s) => a + s[1], 0), pid);
}
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- API
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  if (p === '/api/public' && m === 'GET') {
    const reviews = db.prepare('SELECT data FROM feedback ORDER BY created DESC').all().map(r => JSON.parse(r.data))
      .filter(f => f.published && f.consent && f.comment).slice(0, 12)
      .map(f => ({ name: (f.name || '').split(' ')[0] || 'Customer', comment: f.comment, rating: f.result != null ? f.result : f.csat }));
    const products = allProducts().filter(x => x.active).map(x => ({
      id: x.id, name: x.name, style: x.style, color: x.color, hex: x.hex, price: x.price, img: x.img, gallery: x.gallery,
      sizes: x.sizes.map(s => [s[0], s[1] > 0]) // only "in stock or not", never the exact numbers
    }));
    return send(res, 200, { products, content: content(), reviews, govs: GOVS });
  }

  if (p === '/api/orders' && m === 'POST') {
    if (limited('order:' + ipOf(req), 10, 36e5)) return send(res, 429, { error: 'Too many attempts. Please try again later.' });
    const b = await readJson(req);
    const name = str(b.name, 80), phone = str(b.phone, 20).replace(/\s+/g, ''), gov = str(b.gov, 40), address = str(b.address, 300), notes = str(b.notes, 300);
    if (name.length < 2) return send(res, 400, { error: 'Please enter your name.' });
    if (!/^01[0125]\d{8}$/.test(phone)) return send(res, 400, { error: 'Mobile number must be 11 digits and start with 010, 011, 012 or 015.' });
    if (!GOVS.includes(gov)) return send(res, 400, { error: 'Please choose your governorate.' });
    if (address.length < 5) return send(res, 400, { error: 'Please enter your full address.' });
    const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
    if (!items.length) return send(res, 400, { error: 'Your cart is empty.' });
    const c = content();
    const order = tx(() => {
      const lines = [];
      for (const it of items) {
        const pr = getProduct(str(it && it.pid, 20)), size = str(it && it.size, 8), qty = Math.floor(Number(it && it.qty));
        if (!pr || !pr.active || pr.price <= 0) throw httpErr(400, 'One of the items is not available right now.');
        if (!(qty >= 1 && qty <= 10)) throw httpErr(400, 'Quantity must be between 1 and 10.');
        const row = JSON.parse(pr.sizes).find(s => s[0] === size);
        if (!row) throw httpErr(400, 'Please choose a size.');
        if (row[1] < qty) throw httpErr(409, `${pr.name} (${pr.color}, ${size}): only ${row[1]} left.`);
        moveStock(pr.id, size, -qty);
        const same = lines.find(l => l.pid === pr.id && l.size === size);
        if (same) same.qty += qty; else lines.push({ pid: pr.id, name: pr.name, color: pr.color, size, qty, price: pr.price });
      }
      const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
      const shipping = c.freeShip > 0 && subtotal >= c.freeShip ? 0 : Math.max(0, Number(c.shipFee) || 0);
      const seq = (db.prepare('SELECT MAX(seq) AS s FROM orders').get().s || 1000) + 1;
      const t = now();
      const o = { id: 'MT-' + seq, created: t, deliveredAt: null, name, phone, gov, address, notes, items: lines, subtotal, shipping, total: subtotal + shipping, pay: 'كاش عند الاستلام', status: 'new', teamNotes: '', history: [{ at: t, text: 'الأوردر اتعمل من الموقع' }] };
      db.prepare('INSERT INTO orders(id,seq,created,data) VALUES(?,?,?,?)').run(o.id, seq, t, JSON.stringify(o));
      return o;
    });
    return send(res, 201, { id: order.id, total: order.total, shipping: order.shipping });
  }

  if (p === '/api/track' && m === 'POST') {
    if (limited('track:' + ipOf(req), 20, 36e5)) return send(res, 429, { error: 'Too many attempts. Please try again later.' });
    const b = await readJson(req);
    const id = str(b.order, 20).toUpperCase().replace(/^(\d)/, 'MT-$1');
    const o = ORDER_RE.test(id) ? getOrder(id) : null;
    if (!o || o.phone !== str(b.phone, 20).replace(/\s+/g, '')) return send(res, 404, { error: 'We could not find an order with these details.' });
    const labels = { new: 'Received', confirmed: 'Confirmed', preparing: 'Being prepared', shipped: 'Shipped', delivered: 'Delivered', returned: 'Returned', cancelled: 'Cancelled' };
    return send(res, 200, { id: o.id, status: o.status, label: labels[o.status], created: o.created });
  }

  if (p === '/api/feedback' && m === 'POST') {
    if (limited('fb:' + ipOf(req), 10, 36e5)) return send(res, 429, { error: 'محاولات كتير، جرّب بعد شوية' });
    const b = await readJson(req);
    const type = b.type === 'result' ? 'result' : 'first';
    const int = (v, lo, hi) => { const n = Number(v); return v !== null && v !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
    const f = {
      id: 'fb-' + crypto.randomBytes(6).toString('hex'), orderId: str(b.orderId, 20).toUpperCase(), type,
      csat: type === 'first' ? int(b.csat, 1, 5) : null, fit: type === 'first' && FITS.includes(b.fit) ? b.fit : null,
      result: type === 'result' ? int(b.result, 1, 5) : null, nps: type === 'result' ? int(b.nps, 0, 10) : null,
      reasons: (Array.isArray(b.reasons) ? b.reasons : []).filter(r => REASONS.includes(r)).slice(0, REASONS.length),
      comment: str(b.comment, 600), consent: type === 'result' && b.consent === true, published: false, handled: false, at: now()
    };
    if (type === 'first' ? f.csat == null : (f.result == null || f.nps == null)) return send(res, 400, { error: 'جاوب على أسئلة التقييم الأول' });
    // Only accept feedback for a real order, sent from the signed link the team sent on WhatsApp.
    const o = ORDER_RE.test(f.orderId) ? getOrder(f.orderId) : null;
    if (!o || !fbTokenOk(o.id, b.k)) return send(res, 403, { error: 'اللينك ده مش صالح. استخدم اللينك اللي وصلك على واتساب' });
    // One answer per order per stage: a second submit replaces the first instead of piling up.
    const old = db.prepare('SELECT id,data FROM feedback').all().map(r => JSON.parse(r.data)).find(x => x.orderId === o.id && x.type === type);
    f.name = o.name; f.phone = o.phone;
    o.history.push({ at: f.at, text: 'العميل بعت فيدباك: ' + (type === 'first' ? 'أول انطباع والمقاس' : 'الجودة بعد الاستخدام وNPS') + (old ? ' (عدّل ردّه)' : '') });
    tx(() => {
      putOrder(o);
      if (old) db.prepare('DELETE FROM feedback WHERE id=?').run(old.id);
      db.prepare('INSERT INTO feedback(id,created,data) VALUES(?,?,?)').run(f.id, f.at, JSON.stringify(f));
    });
    return send(res, 201, { ok: true });
  }

  if (p === '/api/login' && m === 'POST') {
    if (limited('login:' + ipOf(req), 8, 15 * 6e4)) return send(res, 429, { error: 'محاولات كتير، استنى ربع ساعة' });
    const b = await readJson(req);
    const u = checkPw(str(b.username, 40).toLowerCase(), String(b.password || '').slice(0, 200));
    if (!u) return send(res, 401, { error: 'اليوزر أو الباسورد غلط' });
    const t = newSession(u.username);
    audit(u.username, 'login');
    return send(res, 200, { username: u.username, name: u.name, role: u.role }, { 'Set-Cookie': `${COOKIE}=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}` });
  }
  if (p === '/api/logout' && m === 'POST') {
    const mm = cookieRe.exec(req.headers.cookie || '');
    if (mm) db.prepare('DELETE FROM sessions WHERE token=?').run(mm[1]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }

  // ----- everything below needs a login
  const user = userFrom(req);
  if (p === '/api/me') return user ? send(res, 200, user) : send(res, 401, { error: 'login' });
  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'not found' });
  if (!user) return send(res, 401, { error: 'login' });
  const canEdit = user.role === 'admin' || user.role === 'staff';
  const isAdmin = user.role === 'admin';
  const deny = () => send(res, 403, { error: 'مالكش صلاحية تعمل ده' });

  if (p === '/api/admin/state' && m === 'GET') {
    const sent = {}; db.prepare('SELECT key,at FROM sent').all().forEach(r => { sent[r.key] = r.at; });
    return send(res, 200, {
      me: user, products: allProducts(),
      // fbToken is computed on the fly (never stored) so the dashboard can build signed feedback links.
      orders: db.prepare('SELECT data FROM orders ORDER BY seq DESC').all().map(r => { const o = JSON.parse(r.data); if (canEdit) o.fbToken = fbToken(o.id); return o; }),
      feedback: db.prepare('SELECT data FROM feedback ORDER BY created DESC').all().map(r => JSON.parse(r.data)),
      sent, settings: settings(), content: content(), reasons: REASONS
    });
  }

  let mm;
  if ((mm = /^\/api\/admin\/orders\/(MT-\d+)$/.exec(p)) && m === 'PATCH') {
    if (!canEdit) return deny();
    const b = await readJson(req), t = now(), L = { new: 'جديد', confirmed: 'اتأكد', preparing: 'بيتجهز', shipped: 'اتشحن', delivered: 'اتسلم', returned: 'مرتجع', cancelled: 'ملغي' };
    const o = tx(() => {
      const o = getOrder(mm[1]); if (!o) throw httpErr(404, 'not found');
      if (b.status && STATUSES.includes(b.status) && b.status !== o.status) {
        // An order "holds" stock unless it is returned or cancelled.
        // Releasing gives the pieces back; un-cancelling must take them out again.
        const holds = s => s !== 'returned' && s !== 'cancelled';
        const delta = holds(o.status) === holds(b.status) ? 0 : holds(b.status) ? -1 : 1;
        if (delta) for (const it of o.items) {
          try { moveStock(it.pid, it.size, delta * it.qty); }
          catch (e) { if (e.code === 409) throw httpErr(409, 'مفيش مخزون كفاية عشان ترجّع الأوردر ده'); throw e; }
        }
        o.history.push({ at: t, text: `${user.name}: الحالة اتغيرت من "${L[o.status]}" لـ "${L[b.status]}"` + (delta ? (delta > 0 ? ' (القطع رجعت للمخزون)' : ' (القطع اتخصمت من المخزون)') : '') });
        o.status = b.status;
        if (b.status === 'delivered') { o.deliveredAt = t; o.history.push({ at: t, text: 'اتجدولت متابعات ما بعد التسليم' }); }
      }
      if (typeof b.teamNotes === 'string' && str(b.teamNotes, 1000) !== o.teamNotes) { o.teamNotes = str(b.teamNotes, 1000); o.history.push({ at: t, text: `${user.name}: عدّل ملاحظات التيم` }); }
      if (typeof b.historyNote === 'string' && b.historyNote.trim()) o.history.push({ at: t, text: `${user.name}: ${str(b.historyNote, 200)}` });
      putOrder(o);
      return o;
    });
    audit(user.username, 'order', { id: o.id, status: o.status });
    o.fbToken = fbToken(o.id);
    return send(res, 200, o);
  }
  if ((mm = /^\/api\/admin\/products\/([a-z0-9]+)$/.exec(p)) && m === 'PUT') {
    if (!isAdmin) return deny();
    const b = await readJson(req);
    const pr = getProduct(mm[1]); if (!pr) return send(res, 404, { error: 'not found' });
    const price = Math.max(0, Math.min(1e7, Math.floor(Number(b.price) || 0)));
    const seen = new Set(), sizes = [];
    for (const s of (Array.isArray(b.sizes) ? b.sizes : []).slice(0, 12)) {
      const label = str(Array.isArray(s) ? s[0] : '', 8).toUpperCase(), n = Math.max(0, Math.min(1e6, Math.floor(Number(Array.isArray(s) ? s[1] : 0) || 0)));
      if (!/^[A-Z0-9][A-Z0-9 ./-]{0,7}$/.test(label)) return send(res, 400, { error: 'اسم المقاس لازم يبقى حروف إنجليزي أو أرقام، زي S أو XL أو 32' });
      if (seen.has(label)) return send(res, 400, { error: 'المقاس ' + label + ' متكرر' });
      seen.add(label); sizes.push([label, n]);
    }
    if (!sizes.length) return send(res, 400, { error: 'لازم يبقى فيه مقاس واحد على الأقل' });
    const name = str(b.name, 120) || pr.name, color = str(b.color, 40) || pr.color;
    const stock = sizes.reduce((a, s) => a + s[1], 0);
    db.prepare('UPDATE products SET name=?, color=?, price=?, sizes=?, stock=?, active=? WHERE id=?').run(name, color, price, JSON.stringify(sizes), stock, b.active ? 1 : 0, pr.id);
    audit(user.username, 'product', { id: pr.id, price, sizes, active: !!b.active });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/content' && m === 'PUT') {
    if (!isAdmin) return deny();
    const b = await readJson(req);
    const wa = str(b.whatsapp, 20).replace(/[^\d]/g, '');
    if (wa && !/^201[0125]\d{8}$/.test(wa)) return send(res, 400, { error: 'رقم الواتساب لازم يبقى موبايل مصري 11 رقم' });
    const c = {
      ann: (Array.isArray(b.ann) ? b.ann : []).slice(0, 3).map(x => str(x, 140)),
      heroTitle: str(b.heroTitle, 120), heroBody: str(b.heroBody, 400), heroCta: str(b.heroCta, 40),
      freeShip: Math.max(0, Math.floor(Number(b.freeShip) || 0)), shipFee: Math.max(0, Math.floor(Number(b.shipFee) || 0)),
      whatsapp: wa
    };
    while (c.ann.length < 3) c.ann.push('');
    kvSet('content', c); audit(user.username, 'content', c);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/settings' && m === 'PUT') {
    if (!isAdmin) return deny();
    const b = await readJson(req), s = {};
    ['dFit', 'dFirst', 'dResult', 'dReorder'].forEach(k => { const n = Math.floor(Number(b[k])); s[k] = b[k] !== '' && n >= 1 && n <= 365 ? n : ''; });
    ['msgFit', 'msgFirst', 'msgResult', 'msgReorder', 'msgRecover'].forEach(k => { s[k] = str(b[k], 600) || DEFAULT_SETTINGS[k]; });
    kvSet('settings', s); audit(user.username, 'settings', s);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/sent' && m === 'POST') {
    if (!canEdit) return deny();
    const b = await readJson(req), key = str(b.key, 40);
    if (!new RegExp('^MT-\\d+:(' + FU_TYPES.join('|') + ')$').test(key)) return send(res, 400, { error: 'bad key' });
    const t = now();
    db.prepare('INSERT INTO sent(key,at) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run(key, t);
    const o = getOrder(key.split(':')[0]);
    const TL = { fit: 'سؤال المقاس', first: 'أول انطباع', result: 'الجودة وNPS', reorder: 'إعادة الطلب' };
    if (o) { o.history.push({ at: t, text: `${user.name}: ${b.skipped ? 'اتخطّت' : 'اتبعتت'} متابعة (${TL[key.split(':')[1]]})` }); putOrder(o); }
    audit(user.username, 'followup', { key, skipped: !!b.skipped });
    return send(res, 200, { ok: true });
  }
  if ((mm = /^\/api\/admin\/feedback\/(fb-[a-f0-9]+)$/.exec(p)) && m === 'PATCH') {
    if (!canEdit) return deny();
    const r = db.prepare('SELECT data FROM feedback WHERE id=?').get(mm[1]); if (!r) return send(res, 404, { error: 'not found' });
    const f = JSON.parse(r.data), b = await readJson(req);
    if (typeof b.handled === 'boolean') f.handled = b.handled;
    if (typeof b.published === 'boolean') {
      if (b.published && !f.consent) return send(res, 400, { error: 'العميل موافقش على النشر' });
      if (b.published && !f.comment) return send(res, 400, { error: 'مفيش تعليق يتنشر' });
      f.published = b.published;
    }
    db.prepare('UPDATE feedback SET data=? WHERE id=?').run(JSON.stringify(f), f.id);
    audit(user.username, 'feedback', { id: f.id, handled: f.handled, published: f.published });
    return send(res, 200, f);
  }
  return send(res, 404, { error: 'not found' });
}

// ---------- static files
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const ROUTES = { '/': 'index.html', '/admin': 'admin.html', '/feedback': 'feedback.html' };
// Content-Security-Policy: the browser only runs code and loads styles/fonts/images from these places.
// No inline <script> and no style="" anywhere, so an injected tag or attribute is refused by the browser.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};
// ---------- cache busting
// Every page links to its CSS/JS with a fingerprint of the file's content: store.css?v=Ab12Cd34.
// When the file changes the address changes, so browsers and Cloudflare fetch the new one at once.
const versions = new Map(); // name -> { mtime, v }
function fileVersion(name) {
  const file = path.join(PUBLIC, name);
  try {
    const mtime = fs.statSync(file).mtimeMs, hit = versions.get(name);
    if (hit && hit.mtime === mtime) return hit.v;
    const v = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 10);
    versions.set(name, { mtime, v });
    return v;
  } catch { return null; }
}
const withVersions = html => html.replace(/(href|src)="([a-z0-9-]+\.(?:css|js|svg))(#[a-z]+)?"/g, (m, attr, f, hash) => {
  const v = fileVersion(f);
  return v ? `${attr}="${f}?v=${v}${hash || ''}"` : m;
});

function serveStatic(req, res, url) {
  let name = ROUTES[url.pathname.replace(/\/+$/, '') || '/'] || url.pathname.slice(1);
  // Only plain file names with a known extension: no "/", no "..", so nothing outside public/ can be read.
if (PRIVATE.has(name) || !/^[a-z0-9-]+\.(html|css|js|png|jpg|webp|svg|ico|woff2|txt)$/.test(name)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  const file = path.join(PUBLIC, name);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(name);
    if (ext === '.html') buf = Buffer.from(withVersions(buf.toString('utf8')));
    // ETag = fingerprint of the content. If the browser already has it we answer 304 with no body.
    const etag = '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 16) + '"';
    const fingerprinted = ['.css', '.js', '.svg'].includes(ext) && url.searchParams.get('v') === fileVersion(name);
    const cache = ext === '.html' ? 'no-cache'
      : fingerprinted ? 'public, max-age=31536000, immutable'
      : ext === '.css' || ext === '.js' ? 'no-cache' : ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'public, max-age=604800';
    const private_ = name === 'admin.html' || name === 'feedback.html';
    const headers = { 'Content-Type': TYPES[ext], ETag: etag, 'Cache-Control': cache, ...SECURITY_HEADERS, ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}), ...(private_ ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

// ---------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
if (cmd === 'set-user') {
  try { const pw = setUser(String(a1 || '').toLowerCase(), a2 || 'admin', a3 || a1); console.log(`    user: ${String(a1).toLowerCase()}   password: ${pw}`); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
} else if (cmd === 'backup') {
  const dir = path.resolve(a1 || path.join(DATA, 'backups')); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `mount-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file); // VACUUM INTO refuses to overwrite; a second run the same day replaces it
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  for (const f of fs.readdirSync(dir).filter(f => /^mount-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0, -30)) fs.unlinkSync(path.join(dir, f));
  console.log('backup:', file);
} else {
  http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      serveStatic(req, res, url);
    } catch (e) {
      const code = e.code && Number.isInteger(e.code) ? e.code : 500;
      if (code === 500) console.error(e);
      if (!res.headersSent) send(res, code, { error: code === 500 ? 'Something went wrong. Please try again.' : e.message });
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`MOUNT on http://127.0.0.1:${PORT}`));
}

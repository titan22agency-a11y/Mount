(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id){ return document.getElementById(id); }
  function $$(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function egp(n){ return 'LE ' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function toast(t){ var el=$('toast'); $('toastText').textContent=t; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(function(){ el.classList.remove('show'); }, 2600); }
  $('year').textContent = new Date().getFullYear();

  var DATA = { products:[], content:{}, reviews:[], govs:[] }, loaded = false;

  /* ---------- announcement ticker (3 messages from the dashboard) */
  var tickerPaused = reduce;
  function renderTicker(msgs){
    var half = ''; for(var r=0;r<4;r++) msgs.forEach(function(m){ half += '<span>'+esc(m)+'</span>'; });
    $('tickerTrack').innerHTML = half + half; // two equal halves, so the -50% loop is seamless
    $('annList').innerHTML = msgs.map(function(m){ return '<li>'+esc(m)+'</li>'; }).join(''); // screen readers get a plain list
  }
  function setTicker(p){ tickerPaused = p; $('ann').classList.toggle('paused', p); var b = $('tickerPause'); b.setAttribute('aria-pressed', p); b.setAttribute('aria-label', p ? 'Play announcements' : 'Pause announcements'); b.textContent = p ? '▶' : '❚❚'; }
  $('tickerPause').onclick = function(){ setTicker(!tickerPaused); };
  renderTicker(['Pay cash on delivery', 'Comfort should look good', 'Higher. Stronger. Together.']); setTicker(tickerPaused);

  /* ---------- mobile menu + active link */
  var menuBtn = $('menuBtn'), nav = $('mainNav');
  function menu(open){ nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open); menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Menu'); }
  menuBtn.onclick = function(){ menu(!nav.classList.contains('open')); };
  nav.addEventListener('click', function(e){ if(e.target.closest('a')) menu(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && nav.classList.contains('open')){ menu(false); menuBtn.focus(); } });
  window.addEventListener('resize', function(){ if(window.innerWidth > 900) menu(false); });
  function markNav(href, filter){ $$('a', nav).forEach(function(a){ a.classList.toggle('on', a.getAttribute('href') === href && (a.dataset.filter || '') === (filter || '')); }); }
  markNav('#top', '');

  /* ---------- back to top */
  var toTop = $('toTop');
  window.addEventListener('scroll', function(){ toTop.hidden = window.scrollY < 700; }, { passive:true });
  toTop.onclick = function(){ window.scrollTo({ top:0, behavior: reduce ? 'auto' : 'smooth' }); $('cartBtn').focus(); };

  /* ---------- hero carousel */
  var hero = $('top'), slides = $$('.slide', hero), dots = $$('.dot', hero), si = 0, timer, paused = reduce, hover = false, pauseBtn = $('heroPause');
  function go(i){
    si = (i + slides.length) % slides.length;
    slides.forEach(function(s,k){ s.classList.toggle('on', k===si); s.setAttribute('aria-hidden', k===si ? 'false' : 'true'); $$('a,button', s).forEach(function(a){ a.tabIndex = k===si ? 0 : -1; }); });
    dots.forEach(function(d,k){ d.classList.toggle('on', k===si); if(k===si) d.setAttribute('aria-current','true'); else d.removeAttribute('aria-current'); });
  }
  function auto(){ clearInterval(timer); timer = setInterval(function(){ if(!paused && !hover && !document.hidden) go(si+1); }, 7000); }
  function setPaused(p){ paused = p; pauseBtn.setAttribute('aria-pressed', p); pauseBtn.setAttribute('aria-label', p ? 'Play slideshow' : 'Pause slideshow'); pauseBtn.textContent = p ? '▶' : '❚❚'; }
  pauseBtn.onclick = function(){ setPaused(!paused); };
  ['mouseenter','focusin'].forEach(function(ev){ hero.addEventListener(ev, function(){ hover = true; }); });
  ['mouseleave','focusout'].forEach(function(ev){ hero.addEventListener(ev, function(){ hover = false; }); });
  $('heroPrev').onclick = function(){ go(si-1); auto(); };
  $('heroNext').onclick = function(){ go(si+1); auto(); };
  dots.forEach(function(d,k){ d.onclick = function(){ go(k); auto(); }; });
  var sx = null;
  hero.addEventListener('touchstart', function(e){ sx = e.touches[0].clientX; }, { passive:true });
  hero.addEventListener('touchend', function(e){ if(sx == null) return; var dx = e.changedTouches[0].clientX - sx; if(Math.abs(dx) > 50){ go(si + (dx < 0 ? 1 : -1)); auto(); } sx = null; });
  setPaused(paused); go(0); auto();

  /* ---------- details reel */
  var reel = $('reel');
  function reelStep(){ var c = reel.querySelector('.reel-card'); return c ? c.getBoundingClientRect().width + 18 : 300; }
  $('reelPrev').onclick = function(){ reel.scrollBy({ left:-reelStep(), behavior: reduce ? 'auto' : 'smooth' }); };
  $('reelNext').onclick = function(){ reel.scrollBy({ left:reelStep(), behavior: reduce ? 'auto' : 'smooth' }); };
  reel.addEventListener('keydown', function(e){ if(e.key === 'ArrowRight'){ e.preventDefault(); $('reelNext').click(); } if(e.key === 'ArrowLeft'){ e.preventDefault(); $('reelPrev').click(); } });

  /* ---------- FAQ */
  function faqs(){
    var c = DATA.content || {}, ship;
    if(c.shipFee > 0) ship = 'Shipping is ' + egp(c.shipFee) + (c.freeShip > 0 ? ', and free on orders over ' + egp(c.freeShip) + '.' : '.');
    else ship = '[SHIPPING FEE]';
    return [
      ['What are they made of?', 'Women\'s Sculpted Wide-Leg Sweatpants: cotton blend with a fleece, spongy back. Men\'s Wide-Leg Sweatpants: [FABRIC COMPOSITION].'],
      ['How do I choose my size?', '[SIZE CHART]. Between two sizes? Message us on WhatsApp with your usual size and we will help you pick.'],
      ['How do I pay?', 'Cash on delivery. You pay the courier when your order arrives.'],
      ['How much is shipping and how long does it take?', ship + ' [DELIVERY TIME BY GOVERNORATE]'],
      ['Can I exchange the size?', 'Message us on WhatsApp with your order number. [EXCHANGE & RETURN POLICY]'],
      ['How do I track my order?', 'Use Track your order with your order number (it starts with MT-) and the mobile number you ordered with.']
    ];
  }
  function renderFaq(){
    var fl = $('faqList');
    fl.innerHTML = faqs().map(function(f,i){ return '<div class="faq-item"><button type="button" class="faq-q" aria-expanded="false" aria-controls="fa'+i+'" id="fq'+i+'"><span>'+esc(f[0])+'</span><span class="pl" aria-hidden="true">+</span></button><div class="faq-a" id="fa'+i+'" role="region" aria-labelledby="fq'+i+'"><p>'+esc(f[1])+'</p></div></div>'; }).join('');
    var items = $$('.faq-item', fl);
    function setOpen(item, on){ var a = item.querySelector('.faq-a'); item.classList.toggle('open', on); item.querySelector('.faq-q').setAttribute('aria-expanded', on); a.style.maxHeight = on ? a.scrollHeight + 'px' : '0px'; }
    items.forEach(function(item){ item.querySelector('.faq-q').onclick = function(){ var was = item.classList.contains('open'); items.forEach(function(o){ setOpen(o,false); }); if(!was) setOpen(item,true); }; });
  }
  renderFaq();
  window.addEventListener('resize', function(){ $$('.faq-item.open .faq-a').forEach(function(a){ a.style.maxHeight = a.scrollHeight + 'px'; }); });

  /* ---------- products: one card per style, colours as swatches */
  var tab = 'all', pick = {}; // pick[groupKey] = { pid, size }
  var POINTS = {
    women: ['High waist with a sculpted waistband', 'Curved front panel lines', 'Side panels with a different fabric direction', 'Angled pockets', 'Wide-leg silhouette', 'Embroidered MOUNT logo on the left thigh', 'Cotton blend, fleece (spongy) back'],
    men: ['Elastic waistband', 'Relaxed wide-leg silhouette', 'Embroidered mountain logo', 'Woven MOUNT label at the pocket', 'Fabric: [FABRIC COMPOSITION]']
  };
  function groups(){
    var out = [], idx = {};
    DATA.products.forEach(function(p){ var k = p.style + '|' + p.name; if(!(k in idx)){ idx[k] = out.length; out.push({ key:k, style:p.style, name:p.name, items:[] }); } out[idx[k]].items.push(p); });
    return out;
  }
  function group(key){ return groups().find(function(g){ return g.key === key; }); }
  function prod(id){ return DATA.products.find(function(p){ return p.id === id; }); }
  function styleLabel(s){ return s === 'women' ? 'Women' : s === 'men' ? 'Men' : s; }
  function state(g){ var st = pick[g.key]; if(!st || !prod(st.pid)) st = pick[g.key] = { pid: g.items[0].id, size: null }; return st; }
  var EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';
  var BAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>';
  function swatchesHtml(g, pid){ return g.items.map(function(x){ return '<button type="button" class="sw" data-pid="'+esc(x.id)+'" aria-pressed="'+(x.id===pid)+'" aria-label="'+esc(x.color)+'" title="'+esc(x.color)+'"><i data-hex="'+esc(x.hex||'#999')+'"></i></button>'; }).join(''); }
  function paint(root){ $$('.sw i', root).forEach(function(i){ i.style.background = i.dataset.hex; }); } // CSSOM: allowed under the strict CSP, unlike style=""
  function cardHtml(g){
    var p = prod(state(g).pid), buyable = p.price > 0, anyStock = p.sizes.some(function(s){ return s[1]; });
    var badge = !buyable ? '<span class="badge soon">Coming soon</span>' : !anyStock ? '<span class="badge">Sold out</span>' : '<span class="badge">' + styleLabel(g.style) + '</span>';
    var img = p.img ? '<img src="'+esc(p.img)+'" alt="" loading="lazy">' + (p.gallery[1] ? '<img class="alt" src="'+esc(p.gallery[1])+'" alt="" loading="lazy">' : '') : '<div class="no-photo"><span>Photo coming soon</span></div>';
    var label = esc(g.name + ', ' + p.color);
    return '<article class="pcard rv" data-key="'+esc(g.key)+'">'+
      '<div class="pc-media">'+badge+'<button type="button" class="pc-open" data-qv aria-label="Quick view: '+label+'">'+img+'</button>'+
        '<div class="pc-acts"><button type="button" class="pc-act" data-qv aria-label="Quick view: '+label+'">'+EYE+'</button><button type="button" class="pc-act" data-qadd aria-label="Choose size and add to cart: '+label+'">'+BAG+'</button></div></div>'+
      '<h3 class="pc-title"><button type="button" data-qv>'+esc(g.name)+'</button></h3>'+
      '<span class="pc-price'+(buyable ? '' : ' soon')+'">'+(buyable ? egp(p.price) : 'Price coming soon')+'</span>'+
      (g.items.length > 1 ? '<div class="pc-sw" role="group" aria-label="Colour">'+swatchesHtml(g, p.id)+'</div>' : '<span class="muted">'+esc(p.color)+'</span>')+
    '</article>';
  }
  function renderGrid(){
    var gs = groups().filter(function(g){ return tab === 'all' || g.style === tab; }), grid = $('grid');
    grid.innerHTML = gs.length ? gs.map(cardHtml).join('') : '<p class="grid-err">Nothing here yet. Check back soon.</p>';
    paint(grid); $$('.rv', grid).forEach(reveal);
    var lg = groups().find(function(g){ return g.style === 'women'; }) || groups()[0], lc = $('lookCard');
    lc.innerHTML = lg ? cardHtml(lg) : ''; paint(lc); $$('.rv', lc).forEach(function(x){ x.classList.add('in'); });
  }
  function onCardClick(e){
    var card = e.target.closest('.pcard'); if(!card) return;
    var g = group(card.dataset.key), b;
    if((b = e.target.closest('.sw'))){ state(g).pid = b.dataset.pid; state(g).size = null; var n = document.createElement('div'); n.innerHTML = cardHtml(g); n = n.firstChild; n.classList.add('in'); card.replaceWith(n); paint(n); var f = n.querySelector('[data-pid="'+b.dataset.pid+'"]'); if(f) f.focus(); return; }
    if(e.target.closest('[data-qv]')) openQv(g, false, e.target.closest('button'));
    else if(e.target.closest('[data-qadd]')) openQv(g, true, e.target.closest('button'));
  }
  $('grid').addEventListener('click', onCardClick);
  $('lookCard').addEventListener('click', onCardClick);
  $$('.spot').forEach(function(s){ s.onclick = function(){ var p = prod(s.dataset.look); var g = p && group(p.style + '|' + p.name); if(g){ state(g).pid = p.id; openQv(g, false, s); } }; });
  function setTab(t){ tab = t; $$('.tab').forEach(function(b){ var on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); renderGrid(); }
  $$('.tab').forEach(function(b){ b.onclick = function(){ setTab(b.dataset.tab); markNav('#shop', b.dataset.tab); }; });
  $$('[data-filter]').forEach(function(a){ a.addEventListener('click', function(){ setTab(a.dataset.filter); markNav('#shop', a.dataset.filter); }); });

  /* ---------- quick view: photos, colour, size, add to cart */
  var qv = $('qv'), qvKey = null, qvImg = 0, qvFrom = null;
  function renderQv(focusSel){
    var g = group(qvKey); if(!g) return;
    var st = state(g), p = prod(st.pid), buyable = p.price > 0, anyStock = p.sizes.some(function(s){ return s[1]; });
    if(qvImg >= p.gallery.length) qvImg = 0;
    var main = p.gallery.length ? '<img src="'+esc(p.gallery[qvImg])+'" alt="'+esc(g.name+', '+p.color+', photo '+(qvImg+1)+' of '+p.gallery.length)+'">' : '<div class="no-photo"><span>Photo coming soon</span></div>';
    $('qvBody').innerHTML =
      '<div class="qv-gal">'+(p.gallery.length > 1 ? '<div class="qv-thumbs" role="group" aria-label="Photos">'+p.gallery.map(function(src,k){ return '<button type="button" data-img="'+k+'" aria-label="Photo '+(k+1)+'"'+(k===qvImg?' aria-current="true"':'')+'><img src="'+esc(src)+'" alt=""></button>'; }).join('')+'</div>' : '<div></div>')+'<div class="qv-main">'+main+'</div></div>'+
      '<div class="qv-info">'+
        '<p class="kicker">'+styleLabel(g.style)+'</p>'+
        '<h2 id="qvTitle">'+esc(g.name)+'</h2>'+
        '<span class="qv-price'+(buyable?'':' soon')+'">'+(buyable ? egp(p.price) : 'Price coming soon')+'</span>'+
        '<div><p class="opt-label" id="qvCl">Colour: <b>'+esc(p.color)+'</b></p><div class="swatches" role="group" aria-labelledby="qvCl">'+swatchesHtml(g, p.id)+'</div></div>'+
        '<div><p class="opt-label" id="qvSl">Size'+(st.size ? ': <b>'+esc(st.size)+'</b>' : '')+'</p><div class="sizes" role="group" aria-labelledby="qvSl">'+p.sizes.map(function(s){ return '<button type="button" class="sz" data-size="'+esc(s[0])+'" aria-pressed="'+(st.size===s[0])+'"'+(s[1] ? '' : ' disabled aria-label="'+esc(s[0])+', out of stock"')+'>'+esc(s[0])+'</button>'; }).join('')+'</div></div>'+
        '<p class="qv-msg" id="qvMsg" role="alert"></p>'+
        '<button type="button" class="btn block" id="qvAdd"'+(buyable && anyStock ? '' : ' disabled')+'>'+(!buyable ? 'Coming soon' : !anyStock ? 'Sold out' : 'Add to cart')+'</button>'+
        '<ul class="qv-points">'+(POINTS[g.style] || []).map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul>'+
      '</div>';
    paint($('qvBody'));
    if(focusSel){ var f = $('qvBody').querySelector(focusSel); if(f) f.focus(); }
  }
  function openQv(g, toSizes, from){
    if(typeof qv.showModal !== 'function') return;
    qvKey = g.key; qvImg = 0; qvFrom = from || null;
    renderQv(); qv.showModal();
    var f = toSizes ? $('qvBody').querySelector('.sz:not(:disabled)') : null;
    (f || $('qvClose')).focus();
  }
  qv.addEventListener('close', function(){ if(qvFrom && document.contains(qvFrom)) qvFrom.focus(); });
  $('qvClose').onclick = function(){ qv.close(); };
  qv.addEventListener('click', function(e){
    if(e.target === qv){ qv.close(); return; }
    var g = group(qvKey); if(!g) return; var st = state(g), b;
    if((b = e.target.closest('[data-img]'))){ qvImg = Number(b.dataset.img); renderQv('[data-img="'+qvImg+'"]'); return; }
    if((b = e.target.closest('.sw'))){ st.pid = b.dataset.pid; qvImg = 0; var p = prod(st.pid); if(st.size && !p.sizes.some(function(s){ return s[0]===st.size && s[1]; })) st.size = null; renderQv('[data-pid="'+b.dataset.pid+'"]'); syncCard(g); return; }
    if((b = e.target.closest('.sz'))){ st.size = b.dataset.size; renderQv('[data-size="'+b.dataset.size+'"]'); return; }
    if(e.target.closest('#qvAdd')){
      if(!st.size){ $('qvMsg').textContent = 'Choose a size first.'; var s = $('qvBody').querySelector('.sz:not(:disabled)'); if(s) s.focus(); return; }
      addToCart(st.pid, st.size); qv.close();
    }
  });
  qv.addEventListener('keydown', function(e){ var g = group(qvKey); if(!g || !e.target.closest('.qv-main, .qv-thumbs')) return; var n = prod(state(g).pid).gallery.length; if(n < 2) return; if(e.key === 'ArrowRight'){ qvImg = (qvImg+1) % n; renderQv('[data-img="'+qvImg+'"]'); } if(e.key === 'ArrowLeft'){ qvImg = (qvImg-1+n) % n; renderQv('[data-img="'+qvImg+'"]'); } });
  function syncCard(g){ $$('.pcard').forEach(function(c){ if(c.dataset.key === g.key){ var n = document.createElement('div'); n.innerHTML = cardHtml(g); n = n.firstChild; n.classList.add('in'); c.replaceWith(n); paint(n); } }); }

  /* ---------- reveal on scroll */
  var io = ('IntersectionObserver' in window && !reduce) ? new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold:.08 }) : null;
  function reveal(el){ if(io) io.observe(el); else el.classList.add('in'); }
  $$('.tile, .steps li, .t-card').forEach(function(el){ el.classList.add('rv'); reveal(el); });

  /* ---------- cart */
  var cart = [];
  try{ cart = JSON.parse(localStorage.getItem('mount_cart') || '[]'); if(!Array.isArray(cart)) cart = []; }catch(e){ cart = []; }
  function saveCart(){
    try{ localStorage.setItem('mount_cart', JSON.stringify(cart)); }catch(e){}
    var n = cart.reduce(function(a,l){ return a + l.qty; }, 0);
    $('cartCount').textContent = n; $('cartBtn').setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items'));
  }
  function addToCart(pid, size){
    var l = cart.find(function(x){ return x.pid === pid && x.size === size; });
    if(l){ if(l.qty >= 10){ toast('Maximum 10 per item.'); return; } l.qty++; } else cart.push({ pid:pid, size:size, qty:1 });
    saveCart();
    var c = $('cartCount'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    var p = prod(pid); toast('Added: ' + p.name + ' · ' + p.color + ' · ' + size);
  }
  function totals(){
    var sub = cart.reduce(function(a,l){ var p = prod(l.pid); return a + (p ? p.price * l.qty : 0); }, 0), c = DATA.content || {};
    var ship = sub === 0 ? 0 : (c.freeShip > 0 && sub >= c.freeShip ? 0 : (Number(c.shipFee) || 0));
    return { sub:sub, ship:ship, total:sub + ship };
  }
  var drawer = $('cartDrawer'), scrim = $('scrim'), lastFocus = null, step = 'cart';
  function openCart(){ lastFocus = document.activeElement; step = 'cart'; drawer.hidden = false; scrim.hidden = false; document.body.style.overflow = 'hidden'; render(); $('cartClose').focus(); }
  function closeCart(){ drawer.hidden = true; scrim.hidden = true; document.body.style.overflow = ''; if(lastFocus && lastFocus.focus) lastFocus.focus(); }
  $('cartBtn').onclick = openCart; $('cartClose').onclick = closeCart; scrim.onclick = closeCart;
  document.addEventListener('keydown', function(e){
    if(drawer.hidden) return;
    if(e.key === 'Escape'){ closeCart(); return; }
    if(e.key === 'Tab'){ // keep keyboard focus inside the open drawer
      var f = $$('button:not([disabled]), a[href], input, select, textarea', drawer).filter(function(x){ return x.offsetParent !== null; });
      if(!f.length) return;
      if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
    }
  });
  function sizeLeft(l){ var p = prod(l.pid); var s = p && p.sizes.find(function(x){ return x[0] === l.size; }); return !!(s && s[1]); }
  function summaryHtml(){
    var t = totals(), c = DATA.content || {}, note = '';
    if(c.freeShip > 0 && t.sub > 0 && t.sub < c.freeShip) note = '<p class="ship-note">Add ' + egp(c.freeShip - t.sub) + ' more for free shipping.</p>';
    return '<div class="sum"><div><span>Subtotal</span><span>'+egp(t.sub)+'</span></div><div><span>Shipping</span><span>'+(t.ship ? egp(t.ship) : (t.sub ? 'Free' : '—'))+'</span></div><div class="tot"><span>Total</span><span>'+egp(t.total)+'</span></div>'+note+'</div>';
  }
  function render(){
    var body = $('cartBody');
    if(step === 'done') return;
    if(!loaded && cart.length){ body.innerHTML = '<p class="muted">Loading your cart…</p>'; return; }
    if(!cart.length){ $('cartTitle').textContent = 'Your cart'; body.innerHTML = '<p class="muted">Your cart is empty.</p><a class="btn" href="#shop" id="goShop">Shop the collection</a>'; $('goShop').onclick = closeCart; return; }
    if(step === 'checkout') return renderCheckout();
    $('cartTitle').textContent = 'Your cart';
    body.innerHTML = cart.map(function(l,i){
      var p = prod(l.pid);
      return '<div class="line"><div class="line-img">'+(p.img ? '<img src="'+esc(p.img)+'" alt="">' : '')+'</div><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.color)+' · Size '+esc(l.size)+(sizeLeft(l) ? '' : ' · <b>out of stock</b>')+'</p>'+
        '<div><span class="qty"><button type="button" data-dec="'+i+'" aria-label="Decrease quantity">−</button><span aria-live="polite">'+l.qty+'</span><button type="button" data-inc="'+i+'" aria-label="Increase quantity">+</button></span><button type="button" class="rm" data-rm="'+i+'">Remove</button></div></div>'+
        '<span class="line-price">'+egp(p.price * l.qty)+'</span></div>';
    }).join('') + summaryHtml() + '<button type="button" class="btn block" id="toCheckout">Checkout · cash on delivery</button>';
    $('toCheckout').onclick = function(){ step = 'checkout'; render(); var n = $('coName'); if(n) n.focus(); };
  }
  $('cartBody').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b || step !== 'cart') return;
    var i;
    if(b.dataset.inc != null){ i = Number(b.dataset.inc); cart[i].qty = Math.min(10, cart[i].qty + 1); }
    else if(b.dataset.dec != null){ i = Number(b.dataset.dec); cart[i].qty--; if(cart[i].qty < 1) cart.splice(i,1); }
    else if(b.dataset.rm != null){ cart.splice(Number(b.dataset.rm),1); }
    else return;
    saveCart(); render();
    var again = b.dataset.inc != null ? $('cartBody').querySelector('[data-inc="'+i+'"]') : b.dataset.dec != null ? $('cartBody').querySelector('[data-dec="'+i+'"]') : null;
    (again || $('cartClose')).focus();
  });
  var form = { name:'', phone:'', gov:'', address:'', notes:'' };
  function renderCheckout(){
    $('cartTitle').textContent = 'Checkout';
    $('cartBody').innerHTML = '<button type="button" class="back-link" id="backCart">← Back to cart</button>'+
      '<form class="co" id="coForm" novalidate>'+
        '<label class="fld">Full name<input id="coName" autocomplete="name" maxlength="80" required></label>'+
        '<label class="fld">Mobile number<input id="coPhone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="11" placeholder="01XXXXXXXXX" required></label>'+
        '<label class="fld">Governorate<select id="coGov" required><option value="">Choose…</option>'+(DATA.govs || []).map(function(g){ return '<option>'+esc(g)+'</option>'; }).join('')+'</select></label>'+
        '<label class="fld">Address<textarea id="coAddr" rows="3" maxlength="300" autocomplete="street-address" placeholder="Area, street, building, floor, apartment" required></textarea></label>'+
        '<label class="fld">Notes (optional)<textarea id="coNotes" rows="2" maxlength="300" placeholder="Best time to deliver, landmark…"></textarea></label>'+
        '<div class="pay"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 6h18v12H3zM3 10h18"/></svg><span><b>Cash on delivery.</b> Pay the courier when your order arrives.</span></div>'+
        summaryHtml()+
        '<p class="co-err" id="coErr" role="alert"></p>'+
        '<button class="btn block" type="submit" id="coBtn">Place order · '+egp(totals().total)+'</button>'+
      '</form>';
    $('coName').value = form.name; $('coPhone').value = form.phone; $('coGov').value = form.gov; $('coAddr').value = form.address; $('coNotes').value = form.notes;
    $('backCart').onclick = function(){ keep(); step = 'cart'; render(); $('cartClose').focus(); };
    $('coForm').onsubmit = submitOrder;
  }
  function keep(){ form = { name:$('coName').value, phone:$('coPhone').value, gov:$('coGov').value, address:$('coAddr').value, notes:$('coNotes').value }; }
  function bad(id, msg){ var el = $(id); el.setAttribute('aria-invalid','true'); el.focus(); $('coErr').textContent = msg; return false; }
  function submitOrder(e){
    e.preventDefault(); keep();
    $$('[aria-invalid]', $('coForm')).forEach(function(x){ x.removeAttribute('aria-invalid'); });
    var phone = form.phone.replace(/\s+/g,'');
    if(form.name.trim().length < 2) return bad('coName', 'Please enter your name.');
    if(!/^01[0125]\d{8}$/.test(phone)) return bad('coPhone', 'Mobile number must be 11 digits and start with 010, 011, 012 or 015.');
    if(!form.gov) return bad('coGov', 'Please choose your governorate.');
    if(form.address.trim().length < 5) return bad('coAddr', 'Please enter your full address.');
    var btn = $('coBtn'); btn.disabled = true; btn.textContent = 'Placing your order…';
    fetch('/api/orders', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name:form.name, phone:phone, gov:form.gov, address:form.address, notes:form.notes, items: cart.map(function(l){ return { pid:l.pid, size:l.size, qty:l.qty }; }) }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.'); return j; }); })
      .then(function(j){
        cart = []; saveCart(); step = 'done'; form.notes = '';
        $('cartTitle').textContent = 'Order placed';
        $('cartBody').innerHTML = '<div class="done"><svg class="ok" viewBox="0 0 1017 532" aria-hidden="true"><use href="sprite.svg#mark"></use></svg><h3>Thank you</h3><p>Your order number</p><span class="oid">'+esc(j.id)+'</span><p class="muted">Total '+egp(j.total)+', paid cash on delivery. We will contact you on WhatsApp or by phone to confirm. Keep your order number to track it.</p><button type="button" class="btn" id="doneBtn">Continue shopping</button></div>';
        $('doneBtn').onclick = function(){ closeCart(); step = 'cart'; };
        $('doneBtn').focus();
        load(); // refresh stock
      })
      .catch(function(err){ btn.disabled = false; btn.textContent = 'Place order · ' + egp(totals().total); $('coErr').textContent = err.message; load(); });
    return false;
  }

  /* ---------- order tracking */
  var STEPS = ['new','confirmed','preparing','shipped','delivered'], STEP_L = ['Received','Confirmed','Preparing','Shipped','Delivered'];
  $('trackForm').addEventListener('submit', function(e){
    e.preventDefault();
    var out = $('tResult'), o = $('tOrder').value.trim(), ph = $('tPhone').value.replace(/\s+/g,'');
    if(!o || !/^01\d{9}$/.test(ph)){ out.innerHTML = '<p class="t-err">Enter your order number and the 11-digit mobile number you ordered with.</p>'; return; }
    var btn = $('tBtn'); btn.disabled = true;
    fetch('/api/track', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ order:o, phone:ph }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }); })
      .then(function(j){
        var k = STEPS.indexOf(j.status);
        out.innerHTML = '<div class="t-head"><span>'+esc(j.id)+'</span><span>'+esc(j.label)+'</span></div>' +
          (k > -1 ? '<ol class="t-steps" aria-hidden="true">'+STEPS.map(function(s,i){ return '<li'+(i<=k?' class="done"':'')+'></li>'; }).join('')+'</ol><div class="t-steps-l" aria-hidden="true">'+STEP_L.map(function(s){ return '<span>'+s+'</span>'; }).join('')+'</div>' : '') +
          '<p class="muted">Ordered on '+new Date(j.created).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })+'.</p>';
      })
      .catch(function(err){ out.innerHTML = '<p class="t-err">'+esc(err.message)+'</p>'; })
      .then(function(){ btn.disabled = false; });
  });

  /* ---------- live data from the dashboard */
  function apply(){
    var c = DATA.content || {};
    var a = (c.ann || []).filter(function(x){ return x && x.trim(); });
    if(a.length) renderTicker(a);
    if(c.heroTitle){ var t = $('heroTitle'); t.textContent = ''; c.heroTitle.split('\n').forEach(function(line,i){ if(i) t.appendChild(document.createElement('br')); t.appendChild(document.createTextNode(line)); }); }
    if(c.heroBody) $('heroBody').textContent = c.heroBody;
    if(c.heroCta) $('heroCta').textContent = c.heroCta;
    if(c.whatsapp){
      var wa = 'https://wa.me/' + c.whatsapp;
      $('waFloat').href = wa; $('waFloat').hidden = false; toTop.classList.remove('solo');
      var fc = $('footContact'); fc.href = wa; fc.target = '_blank'; fc.rel = 'noopener';
      $('footPhone').textContent = '0' + String(c.whatsapp).replace(/^20/, '');
    } else toTop.classList.add('solo');
    var rv = DATA.reviews || [];
    if(rv.length){
      $('reviews').hidden = false;
      $('revRow').innerHTML = rv.slice(0,6).map(function(r){ var s = ''; for(var i=1;i<=5;i++) s += i <= (r.rating||0) ? '★' : '☆'; return '<figure class="rev">'+(r.rating ? '<span class="stars" aria-label="'+r.rating+' out of 5">'+s+'</span>' : '')+'<blockquote><p>“'+esc(r.comment)+'”</p></blockquote><figcaption class="who">'+esc(r.name)+' · Verified order</figcaption></figure>'; }).join('');
    }
    // drop cart lines whose product or size is gone, or not on sale yet
    cart = cart.filter(function(l){ var p = l && prod(l.pid); return p && p.price > 0 && p.sizes.some(function(s){ return s[0] === l.size; }) && l.qty >= 1; });
    saveCart(); renderGrid(); renderFaq();
    if(qv.open) renderQv();
    if(!drawer.hidden && step === 'cart') render();
  }
  function load(){
    return fetch('/api/public').then(function(r){ if(!r.ok) throw new Error(); return r.json(); })
      .then(function(d){ DATA = d; loaded = true; apply(); })
      .catch(function(){ if(!loaded) $('grid').innerHTML = '<p class="grid-err">Could not load the collection. Check your connection and reload the page.</p>'; });
  }
  saveCart(); load();
})();

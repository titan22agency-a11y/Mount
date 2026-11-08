(function(){
  'use strict';
  var STATUSES = [['new','جديد'],['confirmed','اتأكد'],['preparing','بيتجهز'],['shipped','اتشحن'],['delivered','اتسلم'],['returned','مرتجع'],['cancelled','ملغي']];
  var SL = {}; STATUSES.forEach(function(s){ SL[s[0]] = s[1]; });
  var TP = { fit:'سؤال المقاس', first:'أول انطباع', result:'الجودة وNPS', reorder:'إعادة الطلب', recover:'اتصال بعد تقييم وحش' };
  var FB_T = { first:'أول انطباع', result:'بعد شهر' };
  var FIT = { small:'صغير', right:'مظبوط', large:'كبير' };
  var MSG_KEY = { fit:'msgFit', first:'msgFirst', result:'msgResult', reorder:'msgReorder', recover:'msgRecover' };
  var db = { me:{}, products:[], orders:[], feedback:[], sent:{}, settings:{}, content:{ ann:['','',''] }, reasons:[] };
  var canEdit = false, isAdmin = false;

  function $(s){ return document.querySelector(s); }
  function $$(s, root){ return Array.prototype.slice.call((root||document).querySelectorAll(s)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function money(n){ return Number(n||0).toLocaleString('ar-EG'); }
  function fdate(iso){ var d = new Date(iso); return d.toLocaleDateString('ar-EG', { day:'numeric', month:'short' }) + ' ' + d.toLocaleTimeString('ar-EG', { hour:'numeric', minute:'2-digit' }); }
  function fday(iso){ return new Date(iso).toLocaleDateString('ar-EG', { day:'numeric', month:'short' }); }
  function badge(s){ return '<span class="st st-'+s+'">'+SL[s]+'</span>'; }
  function stars(n){ var s=''; for(var i=1;i<=5;i++) s += i<=n ? '★' : '☆'; return '<span class="stars" aria-label="'+n+' من 5">'+s+'</span>'; }
  function toast(t){ var el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function(){ el.classList.remove('on'); }, 2600); }
  function waLink(phone, msg){ return 'https://wa.me/' + String(phone).replace(/^0/, '20') + '?text=' + encodeURIComponent(msg); }
  function fbLink(o, t){ return location.origin + '/feedback?o=' + encodeURIComponent(o.id) + '&t=' + t + '&k=' + encodeURIComponent(o.fbToken || ''); }
  function first(name){ return String(name||'').trim().split(/\s+/)[0]; }
  function fill(tpl, o, t){ return String(tpl||'').replace(/\{name\}/g, first(o.name)).replace(/\{order\}/g, o.id).replace(/\{link\}/g, fbLink(o, t === 'result' ? 'result' : 'first')); }
  function itemsText(o){ return o.items.map(function(it){ return it.name + ' (' + it.color + '، ' + it.size + ') × ' + it.qty; }).join(' | '); }
  function pieces(o){ return o.items.reduce(function(a,i){ return a + i.qty; }, 0); }
  function valid(o){ return o.status !== 'returned' && o.status !== 'cancelled'; }
  function daysSince(iso){ return Math.floor((Date.now() - new Date(iso)) / 864e5); }
  function isLow(f){ return (f.csat != null && f.csat <= 2) || (f.result != null && f.result <= 2); }
  // Widths and heights are set through the CSSOM: the page's strict CSP blocks style="" in markup.
  function sizeBars(root){ $$('[data-w]', root).forEach(function(el){ el.style.width = el.dataset.w + '%'; }); $$('[data-h]', root).forEach(function(el){ el.style.height = el.dataset.h + 'px'; }); $$('[data-hex]', root).forEach(function(el){ el.style.background = el.dataset.hex; }); }

  function api(method, url, body){
    return fetch(url, { method:method, credentials:'same-origin', headers: body ? { 'Content-Type':'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
        if(r.status === 401 && url !== '/api/login'){ showLogin(); throw new Error('login'); }
        if(!r.ok) throw new Error(j.error || 'حصل خطأ، جرّب تاني');
        return j;
      }); });
  }
  function fail(e){ if(e && e.message !== 'login') toast(e.message || 'حصل خطأ'); }
  function loadState(){
    return api('GET', '/api/admin/state').then(function(s){
      db = s; canEdit = s.me.role === 'admin' || s.me.role === 'staff'; isAdmin = s.me.role === 'admin';
      document.body.classList.toggle('viewer', !canEdit); document.body.classList.toggle('not-admin', !isAdmin);
      $('#viewerNote').hidden = canEdit;
      $('#meName').textContent = s.me.name; $('#meRole').textContent = { admin:'أدمن', staff:'تيم', viewer:'عرض بس' }[s.me.role] || s.me.role;
      renderAll();
    }).catch(fail);
  }

  /* ---------- login */
  function showLogin(){ $('#app').hidden = true; $('#login').hidden = false; $('#lUser').focus(); }
  function enter(){ $('#login').hidden = true; $('#app').hidden = false; return loadState(); }
  $('#loginForm').addEventListener('submit', function(e){
    e.preventDefault(); $('#lErr').hidden = true;
    api('POST', '/api/login', { username: $('#lUser').value.trim(), password: $('#lPass').value })
      .then(function(){ $('#lPass').value = ''; return enter(); })
      .catch(function(err){ $('#lErr').textContent = err.message; $('#lErr').hidden = false; });
  });
  $('#logout').onclick = function(){ api('POST', '/api/logout').then(function(){ location.reload(); }, function(){ location.reload(); }); };
  setInterval(function(){ if(!$('#app').hidden && $('#drawer').hidden && !document.hidden && !editing()) loadState(); }, 60000);
  function editing(){ var a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#v-products, #v-content, #v-settings'); }

  /* ---------- navigation */
  function go(v){
    if(!document.getElementById('v-' + v) || (!isAdmin && (v === 'content' || v === 'settings'))) v = 'overview';
    $$('.nav-btn').forEach(function(b){ var on = b.dataset.view === v; b.classList.toggle('on', on); if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    $$('.view').forEach(function(s){ s.classList.toggle('on', s.id === 'v-' + v); });
    window.scrollTo(0, 0); try{ history.replaceState(null, '', '#' + v); }catch(e){}
    side(false);
  }
  $$('.nav-btn').forEach(function(b){ b.onclick = function(){ go(b.dataset.view); }; });
  document.addEventListener('click', function(e){ var g = e.target.closest('[data-go]'); if(g) go(g.dataset.go); });
  function side(open){ $('#side').classList.toggle('open', open); $('#menuToggle').setAttribute('aria-expanded', open); }
  $('#menuToggle').onclick = function(){ side(!$('#side').classList.contains('open')); };

  /* ---------- follow-up engine */
  function dueList(){
    var s = db.settings, out = [];
    db.orders.forEach(function(o){
      if(o.status !== 'delivered' || !o.deliveredAt) return;
      var age = daysSince(o.deliveredAt);
      [['fit', s.dFit], ['first', s.dFirst], ['result', s.dResult], ['reorder', s.dReorder]].forEach(function(p){
        var day = Number(p[1]); if(!day) return;
        if(age >= day && !db.sent[o.id + ':' + p[0]]){
          var answered = db.feedback.some(function(f){ return f.orderId === o.id && f.type === p[0]; });
          if(!answered) out.push({ o:o, type:p[0], late: age - day });
        }
      });
    });
    db.feedback.forEach(function(f){
      if(isLow(f) && !f.handled){ var o = db.orders.find(function(x){ return x.id === f.orderId; }); if(o) out.unshift({ o:o, type:'recover', late: daysSince(f.at), fb:f }); }
    });
    return out;
  }
  var fuFilter = '';
  function renderFollowups(){
    var all = dueList(); $('#fuCount').textContent = all.length || '';
    var counts = {}; all.forEach(function(x){ counts[x.type] = (counts[x.type] || 0) + 1; });
    $('#fuChips').innerHTML = '<button type="button" class="chip'+(fuFilter===''?' on':'')+'" data-f="" aria-pressed="'+(fuFilter==='')+'">الكل ('+all.length+')</button>' + Object.keys(TP).map(function(k){ return '<button type="button" class="chip'+(fuFilter===k?' on':'')+'" data-f="'+k+'" aria-pressed="'+(fuFilter===k)+'">'+TP[k]+' ('+(counts[k]||0)+')</button>'; }).join('');
    $$('#fuChips .chip').forEach(function(c){ c.onclick = function(){ fuFilter = c.dataset.f; renderFollowups(); }; });
    var list = all.filter(function(x){ return !fuFilter || x.type === fuFilter; });
    var note = !Number(db.settings.dReorder) && isAdmin ? '<p class="sub">رسالة إعادة الطلب مقفولة. فعّلها من <button type="button" class="link-btn" data-go="settings">إعدادات المتابعة</button> لما يبقى عندك جديد تعرضه.</p>' : '';
    $('#fuList').innerHTML = note + (list.length ? list.map(function(x, i){
      var msg = fill(db.settings[MSG_KEY[x.type]], x.o, x.type);
      var said = x.fb ? '<div class="fu-said">قال: "'+esc(x.fb.comment || 'من غير تعليق')+'"'+(x.fb.reasons && x.fb.reasons.length ? ' · '+esc(x.fb.reasons.join('، ')) : '')+'</div>' : '';
      var when = x.type === 'recover' ? '<span class="late">من '+x.late+' يوم</span>' : (x.late > 0 ? '<span class="late">متأخرة '+x.late+' يوم</span>' : '<span class="sub">مستحقة النهارده</span>');
      return '<div class="fu"><div class="who"><b>'+esc(x.o.name)+'</b> <span class="sub">· '+esc(x.o.id)+' · '+esc(x.o.gov)+'</span><div class="fu-meta"><span class="tp tp-'+x.type+'">'+TP[x.type]+'</span>'+when+'</div>'+said+'</div>'+
        '<a class="btn wa sm edit-only" target="_blank" rel="noopener" data-send="'+i+'" href="'+esc(waLink(x.o.phone, msg))+'">ابعت على واتساب</a>'+
        (x.type === 'recover' ? '<button type="button" class="btn ghost sm edit-only" data-handle="'+esc(x.fb.id)+'">اتواصلنا واتحلت</button>' : '<button type="button" class="btn ghost sm edit-only" data-skip="'+i+'">تخطّي</button>')+'</div>';
    }).join('') : '<p class="empty">مفيش متابعات مستحقة دلوقتي.</p>');
    function mark(x, skipped){ return api('POST', '/api/admin/sent', { key: x.o.id + ':' + x.type, skipped: !!skipped }).then(loadState).catch(fail); }
    $$('#fuList [data-send]').forEach(function(a){ a.addEventListener('click', function(){ var x = list[Number(a.dataset.send)]; if(x.type !== 'recover') mark(x, false); }); });
    $$('#fuList [data-skip]').forEach(function(b){ b.onclick = function(){ mark(list[Number(b.dataset.skip)], true).then(function(){ toast('اتخطّت'); }); }; });
    $$('#fuList [data-handle]').forEach(function(b){ b.onclick = function(){ handled(b.dataset.handle); }; });
    var sentList = Object.keys(db.sent).map(function(k){ var p = k.split(':'); return { id:p[0], type:p[1], at:db.sent[k] }; }).sort(function(a,b){ return new Date(b.at) - new Date(a.at); }).slice(0, 8);
    $('#fuSent').innerHTML = sentList.length ? sentList.map(function(s){
      var o = db.orders.find(function(x){ return x.id === s.id; }), replied = db.feedback.some(function(f){ return f.orderId === s.id && f.type === s.type; });
      return '<div class="list-row"><span><b>'+esc(o ? o.name : s.id)+'</b> <span class="tp">'+TP[s.type]+'</span></span><span class="sub">'+fday(s.at)+(s.type === 'first' || s.type === 'result' ? (replied ? ' · ردّ' : ' · لسه مردّش') : '')+'</span></div>';
    }).join('') : '<p class="sub">لسه مفيش.</p>';
  }
  function handled(id){
    var f = db.feedback.find(function(y){ return y.id === id; });
    api('PATCH', '/api/admin/feedback/' + id, { handled:true })
      .then(function(){ var o = f && db.orders.find(function(y){ return y.id === f.orderId; }); return o ? api('PATCH', '/api/admin/orders/' + o.id, { historyNote:'اتقفل التقييم الوحش بعد التواصل' }) : null; })
      .then(loadState).then(function(){ toast('اتسجل إنها اتحلت'); }).catch(fail);
  }

  /* ---------- satisfaction */
  function metrics(){
    var fi = db.feedback.filter(function(f){ return f.csat != null; }), re = db.feedback.filter(function(f){ return f.nps != null; }), fits = db.feedback.filter(function(f){ return f.fit; });
    var csat = fi.length ? Math.round(fi.filter(function(f){ return f.csat >= 4; }).length / fi.length * 100) : null;
    var pro = re.filter(function(f){ return f.nps >= 9; }).length, det = re.filter(function(f){ return f.nps <= 6; }).length, pas = re.length - pro - det;
    var nps = re.length ? Math.round((pro - det) / re.length * 100) : null;
    var fit = fits.length ? Math.round(fits.filter(function(f){ return f.fit === 'right'; }).length / fits.length * 100) : null;
    var m = {}; db.orders.filter(valid).forEach(function(o){ m[o.phone] = (m[o.phone] || 0) + 1; }); var ph = Object.keys(m);
    var rep = ph.length ? Math.round(ph.filter(function(p){ return m[p] > 1; }).length / ph.length * 100) : null;
    return { csat:csat, nps:nps, fit:fit, rep:rep, pro:pro, det:det, pas:pas, nRes:re.length, nFit:fits.length };
  }
  var fbFilter = '';
  function renderSatisfaction(){
    var mt = metrics();
    $('#sCsat').textContent = mt.csat == null ? '—' : mt.csat + '%';
    $('#sNps').textContent = mt.nps == null ? '—' : (mt.nps > 0 ? '+' : '') + mt.nps;
    $('#sFit').textContent = mt.fit == null ? '—' : mt.fit + '%';
    $('#sRepeat').textContent = mt.rep == null ? '—' : mt.rep + '%';
    var t = mt.nRes || 1;
    $('#npsDist').innerHTML = '<span class="d-pro" data-w="'+(mt.pro/t*100)+'"></span><span class="d-pas" data-w="'+(mt.pas/t*100)+'"></span><span class="d-det" data-w="'+(mt.det/t*100)+'"></span>';
    $('#npsNote').textContent = mt.nRes ? ('من '+mt.nRes+' ردود: '+mt.pro+' مروّج، '+mt.pas+' محايد، '+mt.det+' منتقد. لو الردود أقل من 30، الرقم هيتحرك كتير مع كل رد جديد.') : 'لسه مفيش ردود على سؤال بعد شهر.';

    var low = db.feedback.filter(isLow).sort(function(a,b){ return new Date(b.at) - new Date(a.at); });
    var open = low.filter(function(f){ return !f.handled; }); $('#alertCount').textContent = open.length || '';
    $('#alerts').innerHTML = low.length ? low.map(function(f){
      var o = db.orders.find(function(x){ return x.id === f.orderId; }), hrs = Math.floor((Date.now() - new Date(f.at)) / 36e5);
      return '<div class="list-row wrap"><span class="grow"><b>'+esc(f.name)+'</b> · '+esc(f.orderId)+' · '+(f.csat != null ? stars(f.csat) : 'الجودة '+stars(f.result))+'<br><span class="sub">"'+esc(f.comment || 'من غير تعليق')+'"'+(f.reasons.length ? ' · '+esc(f.reasons.join('، ')) : '')+'</span></span>'+
        (f.handled ? '<span class="st st-delivered">اتحلت</span>' : '<span class="late">'+(hrs < 24 ? 'من '+hrs+' ساعة' : 'متأخر: من '+Math.floor(hrs/24)+' يوم')+'</span> <a class="btn wa sm edit-only" target="_blank" rel="noopener" href="'+esc(waLink(f.phone, fill(db.settings.msgRecover, o || { name:f.name, id:f.orderId }, 'first')))+'">كلّمه</a> <button type="button" class="btn ghost sm edit-only" data-handle2="'+esc(f.id)+'">اتحلت</button>')+'</div>';
    }).join('') : '<p class="sub">مفيش تقييمات وحشة.</p>';
    $$('#alerts [data-handle2]').forEach(function(b){ b.onclick = function(){ handled(b.dataset.handle2); }; });

    var rc = {}; db.feedback.forEach(function(f){ var lowish = (f.csat != null && f.csat <= 3) || (f.result != null && f.result <= 3) || (f.nps != null && f.nps <= 6); if(lowish) (f.reasons || []).forEach(function(r){ rc[r] = (rc[r] || 0) + 1; }); });
    var rk = Object.keys(rc).sort(function(a,b){ return rc[b] - rc[a]; }), rm = rc[rk[0]] || 1;
    $('#reasons').innerHTML = rk.length ? rk.map(function(k){ return '<div class="tagbar"><span class="l">'+esc(k)+'</span><span class="track"><span class="b" data-w="'+(rc[k]/rm*100)+'"></span></span><b>'+rc[k]+'</b></div>'; }).join('') : '<p class="sub">لسه مفيش أسباب متسجلة.</p>';

    // fit by product: link each fit answer to the products in that order
    var fp = {};
    db.feedback.forEach(function(f){
      if(!f.fit) return; var o = db.orders.find(function(x){ return x.id === f.orderId; }); if(!o) return;
      var seen = {}; o.items.forEach(function(it){ if(seen[it.pid]) return; seen[it.pid] = 1; var r = fp[it.pid] || (fp[it.pid] = { small:0, right:0, large:0 }); r[f.fit]++; });
    });
    var fk = Object.keys(fp);
    $('#fitTable').innerHTML = fk.length ? fk.map(function(pid){
      var r = fp[pid], n = r.small + r.right + r.large, p = db.products.find(function(x){ return x.id === pid; });
      return '<div class="fit-row"><span><b>'+esc(p ? p.name : pid)+'</b><br><span class="sub">'+esc(p ? p.color : '')+' · '+n+' رد</span></span><span class="fit-bar"><span class="f-small" data-w="'+(r.small/n*100)+'"></span><span class="f-right" data-w="'+(r.right/n*100)+'"></span><span class="f-large" data-w="'+(r.large/n*100)+'"></span></span><span class="sub">صغير '+r.small+' · مظبوط '+r.right+' · كبير '+r.large+'</span></div>';
    }).join('') : '<p class="sub">لسه مفيش ردود على سؤال المقاس.</p>';

    var fl = [['','الكل'],['first','أول انطباع'],['result','بعد شهر'],['consent','موافق على النشر']];
    $('#fbChips').innerHTML = fl.map(function(x){ return '<button type="button" class="chip'+(fbFilter===x[0]?' on':'')+'" data-fb="'+x[0]+'" aria-pressed="'+(fbFilter===x[0])+'">'+x[1]+'</button>'; }).join('');
    $$('#fbChips .chip').forEach(function(c){ c.onclick = function(){ fbFilter = c.dataset.fb; renderSatisfaction(); }; });
    var rows = db.feedback.filter(function(f){ return !fbFilter || (fbFilter === 'consent' ? f.consent : f.type === fbFilter); }).sort(function(a,b){ return new Date(b.at) - new Date(a.at); });
    $('#fbBody').innerHTML = rows.length ? rows.map(function(f){
      var pub = f.consent && f.comment ? '<label class="row"><input type="checkbox" data-pub="'+esc(f.id)+'"'+(f.published ? ' checked' : '')+(canEdit ? '' : ' disabled')+'> انشره</label>' : '<span class="sub">'+(f.consent ? 'مفيش تعليق' : 'مفيش موافقة')+'</span>';
      return '<tr><td class="nowrap">'+fday(f.at)+'</td><td><b>'+esc(f.name)+'</b><br><span class="sub">'+esc(f.orderId)+'</span></td><td><span class="tp">'+FB_T[f.type]+'</span></td><td>'+(f.csat != null ? stars(f.csat) : (f.result != null ? stars(f.result) : '—'))+'</td><td>'+(f.fit ? FIT[f.fit] : '—')+'</td><td>'+(f.nps != null ? '<b>'+f.nps+'</b>/10' : '—')+'</td><td class="wide">'+esc(f.comment || '—')+'</td><td>'+pub+'</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">مفيش فيدباك بالفلتر ده</td></tr>';
    $$('#fbBody [data-pub]').forEach(function(c){ c.onchange = function(){ api('PATCH', '/api/admin/feedback/' + c.dataset.pub, { published: c.checked }).then(loadState).then(function(){ toast(c.checked ? 'اتنشر كريفيو على الموقع' : 'اتشال من الريفيوهات'); }).catch(function(e){ c.checked = !c.checked; fail(e); }); }; });
    sizeBars($('#v-satisfaction'));
  }

  /* ---------- overview */
  function renderOverview(){
    var recent = db.orders.filter(function(o){ return (Date.now() - new Date(o.created)) < 30 * 864e5; });
    var good = recent.filter(valid), sales = good.reduce(function(a,o){ return a + o.total; }, 0);
    $('#kSales').textContent = money(sales); $('#kOrders').textContent = money(recent.length);
    $('#kAov').textContent = good.length ? money(Math.round(sales / good.length)) : '—';
    var mt = metrics(); $('#kCsat').textContent = mt.csat == null ? '—' : mt.csat + '%';
    var nw = db.orders.filter(function(o){ return o.status === 'new'; }).length; $('#newCount').textContent = nw || '';
    var days = [], max = 1;
    for(var i=6;i>=0;i--){ var d = new Date(); d.setDate(d.getDate() - i); var key = d.toDateString(); var v = db.orders.filter(function(o){ return valid(o) && new Date(o.created).toDateString() === key; }).reduce(function(a,o){ return a + o.total; }, 0); days.push({ l: d.toLocaleDateString('ar-EG', { weekday:'short' }), v:v }); if(v > max) max = v; }
    $('#bars').innerHTML = days.map(function(d){ return '<div class="bar"><em>'+(d.v ? money(d.v) : '')+'</em><span class="v" data-h="'+Math.round(d.v / max * 150)+'"></span><small>'+d.l+'</small></div>'; }).join('');
    var att = [];
    if(nw) att.push([nw + ' أوردر جديد محتاج تأكيد', 'orders']);
    var fu = dueList(); if(fu.length) att.push([fu.length + ' متابعة عميل مستحقة', 'followups']);
    var lowOpen = db.feedback.filter(function(f){ return !f.handled && isLow(f); }).length; if(lowOpen) att.push([lowOpen + ' تقييم وحش محتاج اتصال', 'satisfaction']);
    db.orders.forEach(function(o){ if(o.status === 'shipped' && daysSince(o.created) > 4) att.push(['أوردر ' + o.id + ' متشحن من ' + daysSince(o.created) + ' أيام ولسه متسلمش', 'orders']); });
    db.products.forEach(function(p){ if(!p.active) return; if(p.price <= 0) att.push([p.name + ' (' + p.color + '): مفيش سعر، فمش بيتباع', 'products']); else p.sizes.forEach(function(s){ if(s[1] <= 3) att.push([p.name + ' (' + p.color + ') مقاس ' + s[0] + ': ' + (s[1] ? 'فاضل ' + s[1] : 'خلص'), 'products']); }); });
    $('#stockCount').textContent = db.products.filter(function(p){ return p.active && p.price > 0 && p.sizes.some(function(s){ return s[1] <= 3; }); }).length || '';
    $('#attention').innerHTML = att.length ? att.slice(0, 12).map(function(a){ return '<div class="list-row"><span>'+esc(a[0])+'</span><button type="button" class="btn ghost sm" data-go="'+a[1]+'">افتح</button></div>'; }).join('') : '<p class="sub">مفيش حاجة متأخرة.</p>';
    var rows = db.orders.slice().sort(function(a,b){ return new Date(b.created) - new Date(a.created); }).slice(0, 6);
    $('#recentBody').innerHTML = rows.length ? rows.map(rowHtml(['id','name','gov','total','status'])).join('') : '<tr><td colspan="5" class="empty">لسه مفيش أوردرات</td></tr>';
    sizeBars($('#bars'));
  }
  function rowHtml(cols){
    return function(o){
      var cell = { id:'<td><b>'+esc(o.id)+'</b></td>', date:'<td class="nowrap">'+fdate(o.created)+'</td>', name:'<td>'+esc(o.name)+'</td>', phone:'<td class="ltr">'+esc(o.phone)+'</td>', gov:'<td>'+esc(o.gov)+'</td>', qty:'<td>'+pieces(o)+'</td>', total:'<td class="nowrap">'+money(o.total)+' ج</td>', status:'<td>'+badge(o.status)+'</td>' };
      return '<tr class="click" tabindex="0" data-id="'+esc(o.id)+'">' + cols.map(function(c){ return cell[c]; }).join('') + '</tr>';
    };
  }
  document.addEventListener('click', function(e){ var tr = e.target.closest('tr.click[data-id]'); if(tr) openOrder(tr.dataset.id, tr); });
  document.addEventListener('keydown', function(e){ var tr = e.target.closest && e.target.closest('tr.click[data-id]'); if(tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openOrder(tr.dataset.id, tr); } });

  /* ---------- orders */
  var fStatus = '';
  function renderChips(){
    var c = {}; db.orders.forEach(function(o){ c[o.status] = (c[o.status] || 0) + 1; });
    $('#statusChips').innerHTML = '<button type="button" class="chip'+(fStatus===''?' on':'')+'" data-s="" aria-pressed="'+(fStatus==='')+'">الكل ('+db.orders.length+')</button>' + STATUSES.map(function(s){ return '<button type="button" class="chip'+(fStatus===s[0]?' on':'')+'" data-s="'+s[0]+'" aria-pressed="'+(fStatus===s[0])+'">'+s[1]+' ('+(c[s[0]]||0)+')</button>'; }).join('');
    $$('#statusChips .chip').forEach(function(ch){ ch.onclick = function(){ fStatus = ch.dataset.s; renderOrders(); }; });
  }
  function filtered(){ var q = $('#search').value.trim().toLowerCase(); return db.orders.filter(function(o){ return (!fStatus || o.status === fStatus) && (!q || (o.name + ' ' + o.phone + ' ' + o.id).toLowerCase().indexOf(q) > -1); }).sort(function(a,b){ return new Date(b.created) - new Date(a.created); }); }
  function renderOrders(){
    renderChips(); var rows = filtered();
    $('#ordersBody').innerHTML = rows.length ? rows.map(rowHtml(['id','date','name','phone','gov','qty','total','status'])).join('') : '<tr><td colspan="8" class="empty">مفيش أوردرات بالفلتر ده</td></tr>';
  }
  $('#search').oninput = renderOrders;
  $('#exportCsv').onclick = function(){
    var rows = [['رقم الأوردر','التاريخ','العميل','الموبايل','المحافظة','العنوان','ملاحظات العميل','المنتجات','عدد القطع','قيمة المنتجات','الشحن','الإجمالي','الدفع','الحالة','ملاحظات التيم']].concat(filtered().map(function(o){ return [o.id, new Date(o.created).toLocaleString('ar-EG'), o.name, o.phone, o.gov, o.address, o.notes, itemsText(o), pieces(o), o.subtotal, o.shipping, o.total, o.pay, SL[o.status], o.teamNotes]; }));
    // A cell starting with = + - @ (or tab/CR) is run as a formula by Excel. A customer could type
    // =HYPERLINK(...) as their name, so put a ' in front and Excel shows it as plain text.
    var cell = function(c){ var s = String(c == null ? '' : c); if(/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    var csv = '﻿' + rows.map(function(r){ return r.map(cell).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = 'mount-orders-' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  /* ---------- order drawer */
  var lastFocus = null;
  function openOrder(id, from){
    var o = db.orders.find(function(x){ return x.id === id; }); if(!o) return;
    if(from) lastFocus = from;
    var fbs = db.feedback.filter(function(f){ return f.orderId === o.id; });
    var msg = 'أهلًا ' + first(o.name) + '، معاك فريق MOUNT بخصوص أوردرك رقم ' + o.id + ' (' + SL[o.status] + ').';
    $('#dTitle').textContent = 'أوردر ' + o.id;
    $('#dBody').innerHTML =
      '<div class="row">'+badge(o.status)+'<span class="sub">'+fdate(o.created)+'</span></div>'+
      '<label class="f edit-only">غيّر الحالة<select class="select" id="dStatus">'+STATUSES.map(function(s){ return '<option value="'+s[0]+'"'+(s[0] === o.status ? ' selected' : '')+'>'+s[1]+'</option>'; }).join('')+'</select></label>'+
      '<div class="row"><a class="btn wa" target="_blank" rel="noopener" href="'+esc(waLink(o.phone, msg))+'">كلّم العميل على واتساب</a><a class="btn ghost" href="tel:'+esc(o.phone)+'">اتصال</a></div>'+
      '<div class="d-sec"><h3>العميل</h3><dl class="kv"><dt>الاسم</dt><dd>'+esc(o.name)+'</dd><dt>الموبايل</dt><dd class="ltr">'+esc(o.phone)+'</dd><dt>المحافظة</dt><dd>'+esc(o.gov)+'</dd><dt>العنوان</dt><dd>'+esc(o.address)+'</dd>'+(o.notes ? '<dt>ملاحظة العميل</dt><dd>'+esc(o.notes)+'</dd>' : '')+'</dl></div>'+
      '<div class="d-sec"><h3>الأوردر</h3><dl class="kv">'+o.items.map(function(it){ return '<dt>'+esc(it.size)+' × '+it.qty+'</dt><dd>'+esc(it.name)+' · '+esc(it.color)+' · '+money(it.price * it.qty)+' ج</dd>'; }).join('')+'<dt>قيمة المنتجات</dt><dd>'+money(o.subtotal)+' ج</dd><dt>الشحن</dt><dd>'+(o.shipping ? money(o.shipping)+' ج' : 'مجاني')+'</dd><dt>الإجمالي</dt><dd><b>'+money(o.total)+' ج</b></dd><dt>الدفع</dt><dd>'+esc(o.pay)+'</dd></dl></div>'+
      (fbs.length ? '<div class="d-sec"><h3>فيدباك العميل</h3>'+fbs.map(function(f){ return '<div class="list-row"><span><span class="tp">'+FB_T[f.type]+'</span> '+(f.csat != null ? stars(f.csat) : '')+(f.result != null ? stars(f.result) : '')+(f.fit ? ' · المقاس: '+FIT[f.fit] : '')+(f.nps != null ? ' · NPS '+f.nps : '')+'<br><span class="sub">'+esc(f.comment || '—')+'</span></span></div>'; }).join('')+'</div>' : '')+
      (canEdit ? '<div class="d-sec"><h3>لينكات الفيدباك (للتجربة أو للإرسال يدوي)</h3><label class="f">أول انطباع<input class="input ltr" readonly value="'+esc(fbLink(o,'first'))+'" data-copy></label><label class="f">بعد شهر<input class="input ltr" readonly value="'+esc(fbLink(o,'result'))+'" data-copy></label></div>' : '')+
      '<label class="f edit-only">ملاحظات التيم<textarea id="dNotes" rows="3" maxlength="1000" placeholder="مثلًا: العميل طلب التوصيل بعد الساعة 5">'+esc(o.teamNotes || '')+'</textarea></label>'+
      '<button class="btn edit-only" type="button" id="dSave">حفظ</button>'+
      '<div class="d-sec"><h3>سجل الأوردر</h3><div class="timeline">'+o.history.slice().reverse().map(function(h){ return '<div><i></i><span>'+esc(h.text)+'</span><span class="sub">'+fdate(h.at)+'</span></div>'; }).join('')+'</div></div>';
    $$('#dBody [data-copy]').forEach(function(inp){ inp.onfocus = function(){ inp.select(); }; inp.onclick = function(){ inp.select(); if(navigator.clipboard) navigator.clipboard.writeText(inp.value).then(function(){ toast('اللينك اتنسخ'); }, function(){}); }; });
    if(canEdit) $('#dSave').onclick = function(){
      var ns = $('#dStatus').value, btn = $('#dSave'); btn.disabled = true;
      api('PATCH', '/api/admin/orders/' + o.id, { status: ns, teamNotes: $('#dNotes').value }).then(loadState).then(function(){ openOrder(o.id); toast(ns === 'delivered' && o.status !== 'delivered' ? 'اتحفظ واتجدولت المتابعات' : 'اتحفظ'); }).catch(function(e){ btn.disabled = false; fail(e); });
    };
    if($('#drawer').hidden){ $('#scrim').hidden = false; $('#drawer').hidden = false; $('#dClose').focus(); }
  }
  function closeD(){ $('#scrim').hidden = true; $('#drawer').hidden = true; if(lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  $('#dClose').onclick = closeD; $('#scrim').onclick = closeD;
  document.addEventListener('keydown', function(e){
    if($('#drawer').hidden) return;
    if(e.key === 'Escape'){ closeD(); return; }
    if(e.key === 'Tab'){ var f = $$('button:not([disabled]), a[href], input, select, textarea', $('#drawer')).filter(function(x){ return x.offsetParent !== null; }); if(!f.length) return; if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); } else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); } }
  });

  /* ---------- products + stock per size */
  function renderProducts(){
    var dis = isAdmin ? '' : ' disabled';
    $('#productList').innerHTML = db.products.map(function(p){
      var sold = db.orders.filter(valid).reduce(function(a,o){ return a + o.items.filter(function(i){ return i.pid === p.id; }).reduce(function(x,i){ return x + i.qty; }, 0); }, 0);
      var lowSizes = p.sizes.filter(function(s){ return s[1] <= 3; }).map(function(s){ return s[0]; });
      return '<div class="card prod" data-id="'+esc(p.id)+'"><div class="prod-img">'+(p.img ? '<img src="'+esc(p.img)+'" alt="">' : '<span class="np">مفيش صورة لسه</span>')+'</div><div>'+
        '<h3>'+esc(p.name)+'</h3><div class="prod-meta"><span class="swatch" data-hex="'+esc(p.hex || '#999')+'"></span><span>'+esc(p.color)+'</span><span class="sub">· '+(p.style === 'women' ? 'حريمي' : 'رجالي')+' · اتباع منه '+money(sold)+' قطعة · المخزون '+money(p.stock)+'</span>'+(p.active && p.price > 0 && lowSizes.length ? '<span class="low">· قليل: '+esc(lowSizes.join('، '))+'</span>' : '')+'</div>'+
        '<div class="prod-fields"><label class="f">الاسم (على الموقع)<input class="input" data-k="name" dir="ltr" maxlength="120" value="'+esc(p.name)+'"'+dis+'></label><label class="f">اللون (على الموقع)<input class="input" data-k="color" dir="ltr" maxlength="40" value="'+esc(p.color)+'"'+dis+'></label><label class="f">السعر (جنيه)<input class="input" type="number" min="0" data-k="price" value="'+p.price+'"'+dis+'></label><label class="f">الحالة<select class="select" data-k="active"'+dis+'><option value="1"'+(p.active ? ' selected' : '')+'>ظاهر في الموقع</option><option value="0"'+(!p.active ? ' selected' : '')+'>مخفي</option></select></label></div>'+
        '<div class="sizes-ed"><span class="f">المخزون بالمقاس</span><table><thead><tr><th>المقاس</th><th>عدد القطع</th><th></th></tr></thead><tbody>'+p.sizes.map(sizeRow(dis)).join('')+'</tbody></table>'+
        (isAdmin ? '<div class="size-actions"><button type="button" class="btn ghost sm" data-addsize>+ مقاس</button><span class="sub">أسماء المقاسات بالإنجليزي، زي S أو XL أو 32.</span></div>' : '')+'</div>'+
        (isAdmin ? '<div class="prod-save"><button class="btn" type="button" data-save>حفظ</button><span class="sub">'+(p.price > 0 ? '' : 'السعر 0: المنتج بيظهر "Coming soon" ومحدش يقدر يطلبه.')+'</span></div>' : '')+
      '</div></div>';
    }).join('');
    sizeBars($('#productList'));
    $$('#productList .prod').forEach(function(card){
      var add = card.querySelector('[data-addsize]');
      if(add) add.onclick = function(){ var tb = card.querySelector('tbody'); var tmp = document.createElement('tbody'); tmp.innerHTML = sizeRow('')(['', 0]); var tr = tmp.firstChild; tb.appendChild(tr); tr.querySelector('input').focus(); };
      card.addEventListener('click', function(e){ var rm = e.target.closest('[data-rmsize]'); if(rm){ var tr = rm.closest('tr'); if(card.querySelectorAll('tbody tr').length > 1) tr.remove(); else toast('لازم يفضل مقاس واحد على الأقل'); } });
      var save = card.querySelector('[data-save]');
      if(save) save.onclick = function(){
        var sizes = $$('tbody tr', card).map(function(tr){ var i = tr.querySelectorAll('input'); return [i[0].value.trim().toUpperCase(), Math.max(0, Math.floor(Number(i[1].value) || 0))]; }).filter(function(s){ return s[0]; });
        save.disabled = true;
        api('PUT', '/api/admin/products/' + card.dataset.id, { name: card.querySelector('[data-k=name]').value, color: card.querySelector('[data-k=color]').value, price: Number(card.querySelector('[data-k=price]').value) || 0, active: card.querySelector('[data-k=active]').value === '1', sizes: sizes })
          .then(loadState).then(function(){ toast('المنتج اتحدّث وظاهر على الموقع'); }).catch(function(e){ save.disabled = false; fail(e); });
      };
    });
  }
  function sizeRow(dis){ return function(s){ return '<tr><td><input class="input" dir="ltr" maxlength="8" aria-label="اسم المقاس" value="'+esc(s[0])+'"'+dis+'></td><td><input class="input" type="number" min="0" aria-label="عدد القطع" value="'+s[1]+'"'+dis+'></td><td>'+(dis ? '' : '<button type="button" class="x" data-rmsize aria-label="شيل المقاس">×</button>')+'</td></tr>'; }; }

  /* ---------- customers */
  function renderCustomers(){
    var m = {};
    db.orders.forEach(function(o){ var c = m[o.phone] || (m[o.phone] = { name:o.name, phone:o.phone, gov:o.gov, count:0, spent:0 }); c.count++; if(valid(o)) c.spent += o.total; });
    var q = $('#custSearch').value.trim().toLowerCase();
    var list = Object.keys(m).map(function(k){ return m[k]; }).filter(function(c){ return !q || (c.name + ' ' + c.phone).toLowerCase().indexOf(q) > -1; }).sort(function(a,b){ return b.spent - a.spent; });
    $('#custBody').innerHTML = list.length ? list.map(function(c){
      var last = db.feedback.filter(function(f){ return f.phone === c.phone; }).sort(function(a,b){ return new Date(b.at) - new Date(a.at); })[0];
      var lt = last ? (last.csat != null ? stars(last.csat) : (last.result != null ? stars(last.result) : '—')) : '<span class="sub">لسه</span>';
      return '<tr><td><b>'+esc(c.name)+'</b>'+(c.count > 1 ? ' <span class="st st-delivered">متكرر</span>' : '')+'</td><td class="ltr">'+esc(c.phone)+'</td><td>'+esc(c.gov)+'</td><td>'+c.count+'</td><td class="nowrap">'+money(c.spent)+' ج</td><td>'+lt+'</td><td><a class="btn wa sm" target="_blank" rel="noopener" href="'+esc(waLink(c.phone, 'أهلًا ' + first(c.name) + '، معاك فريق MOUNT.'))+'">واتساب</a></td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty">لسه مفيش عملاء</td></tr>';
  }
  $('#custSearch').oninput = renderCustomers;

  /* ---------- site content */
  function renderContent(){
    if(editing()) return;
    var c = db.content, a = c.ann || [];
    $('#ann1').value = a[0] || ''; $('#ann2').value = a[1] || ''; $('#ann3').value = a[2] || '';
    $('#heroTitle').value = c.heroTitle || ''; $('#heroBody').value = c.heroBody || ''; $('#heroCta').value = c.heroCta || '';
    $('#freeShip').value = c.freeShip || 0; $('#shipFee').value = c.shipFee || 0;
    $('#waNum').value = c.whatsapp ? '0' + String(c.whatsapp).replace(/^20/, '') : '';
  }
  $('#saveContent').onclick = function(){
    var w = $('#waNum').value.replace(/\D/g, '');
    if(w && !/^01[0125]\d{8}$/.test(w)){ toast('رقم الواتساب لازم يبقى 11 رقم ويبدأ بـ 01'); $('#waNum').focus(); return; }
    api('PUT', '/api/admin/content', { ann:[$('#ann1').value, $('#ann2').value, $('#ann3').value], heroTitle: $('#heroTitle').value, heroBody: $('#heroBody').value, heroCta: $('#heroCta').value, freeShip: Number($('#freeShip').value) || 0, shipFee: Number($('#shipFee').value) || 0, whatsapp: w ? w.replace(/^0/, '20') : '' })
      .then(function(){ document.activeElement.blur(); return loadState(); }).then(function(){ toast('اتحفظ وظاهر على الموقع'); }).catch(fail);
  };

  /* ---------- follow-up settings */
  var DAYS = ['dFit','dFirst','dResult','dReorder'], MSGS = ['msgFit','msgFirst','msgResult','msgReorder','msgRecover'];
  function dayId(k){ return '#set' + k.charAt(0).toUpperCase() + k.slice(1); }
  function renderSettings(){ if(editing()) return; DAYS.forEach(function(k){ $(dayId(k)).value = db.settings[k]; }); MSGS.forEach(function(k){ $('#' + k).value = db.settings[k]; }); }
  $('#saveSettings').onclick = function(){
    var s = {};
    DAYS.forEach(function(k){ var v = $(dayId(k)).value; s[k] = v === '' ? '' : Number(v); });
    MSGS.forEach(function(k){ s[k] = $('#' + k).value; });
    if(s.msgFirst.indexOf('{link}') < 0 || s.msgResult.indexOf('{link}') < 0){ toast('رسالة أول انطباع ورسالة بعد شهر لازم فيهم {link}، وإلا العميل مش هيوصل لصفحة التقييم'); return; }
    api('PUT', '/api/admin/settings', s).then(function(){ document.activeElement.blur(); return loadState(); }).then(function(){ toast('الإعدادات اتحفظت'); }).catch(fail);
  };

  function renderAll(){ renderOverview(); renderOrders(); renderProducts(); renderCustomers(); renderFollowups(); renderSatisfaction(); renderContent(); renderSettings(); }

  api('GET', '/api/me').then(function(){ return enter(); }).then(function(){ go((location.hash || '#overview').slice(1)); }).catch(function(){ showLogin(); });
})();

(function(){
  'use strict';
  var params = new URLSearchParams(location.search);
  var orderId = (params.get('o') || '').slice(0, 20).replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  var type = params.get('t') === 'result' ? 'result' : 'first';
  var key = (params.get('k') || '').slice(0, 40); // signed token from the WhatsApp link, checked by the server
  // Same list as the server; anything else is dropped there.
  var REASONS = ['المقاس', 'الخامة', 'التقفيل والخياطة', 'اللون مختلف عن الصور', 'بعد الغسيل', 'التوصيل', 'التغليف', 'السعر', 'خدمة العملاء'];
  var FITS = [['small', 'صغير'], ['right', 'مظبوط'], ['large', 'كبير']];
  var state = { csat:null, fit:null, result:null, nps:null, reasons:[] };
  function $(s){ return document.querySelector(s); }
  function show(el, on){ el.hidden = !on; }

  if(type === 'result'){
    $('#title').textContent = 'شهر مع MOUNT. إيه رأيك دلوقتي؟';
    show($('#qCsat'), false); show($('#qFit'), false);
    show($('#qResult'), true); show($('#qNps'), true); show($('#consentWrap'), true);
  }
  $('#foot').textContent = orderId && orderId !== 'PREVIEW' ? 'أوردر رقم ' + orderId : (orderId === 'PREVIEW' ? 'معاينة: الرد مش هيتسجل' : '');

  // A radiogroup: one tab stop, arrow keys move between options (WAI-ARIA radio pattern).
  function radioGroup(el, values, labelOf, textOf, onPick, cls){
    values.forEach(function(v, i){
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.tabIndex = i === 0 ? 0 : -1;
      b.setAttribute('aria-label', labelOf(v)); b.textContent = textOf(v); if(cls) b.className = cls;
      b.onclick = function(){ pick(i); };
      el.appendChild(b);
    });
    function pick(i){
      Array.prototype.forEach.call(el.children, function(c, k){ c.setAttribute('aria-checked', k === i ? 'true' : 'false'); c.tabIndex = k === i ? 0 : -1; });
      onPick(values[i], i); update();
    }
    el.addEventListener('keydown', function(e){
      var kids = Array.prototype.slice.call(el.children), i = kids.indexOf(document.activeElement); if(i < 0) return;
      var ltr = getComputedStyle(el).direction === 'ltr', next = { ArrowRight: ltr ? 1 : -1, ArrowLeft: ltr ? -1 : 1, ArrowDown: 1, ArrowUp: -1 }[e.key];
      if(next == null) return; e.preventDefault();
      var j = (i + next + kids.length) % kids.length; kids[j].focus(); pick(j);
    });
  }
  function starGroup(el, k){
    radioGroup(el, [1,2,3,4,5], function(v){ return v + ' من 5'; }, function(){ return '★'; }, function(v){
      state[k] = v; Array.prototype.forEach.call(el.children, function(c, i){ c.classList.toggle('on', i < v); });
    });
  }
  starGroup($('#csatStars'), 'csat');
  starGroup($('#resultStars'), 'result');
  radioGroup($('#fitOpts'), FITS, function(f){ return f[1]; }, function(f){ return f[1]; }, function(f){ state.fit = f[0]; });
  radioGroup($('#npsRow'), [0,1,2,3,4,5,6,7,8,9,10], function(v){ return v + ' من 10'; }, function(v){ return String(v); }, function(v){ state.nps = v; });
  REASONS.forEach(function(r){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = r; b.setAttribute('aria-pressed', 'false');
    b.onclick = function(){ var i = state.reasons.indexOf(r); if(i > -1) state.reasons.splice(i, 1); else state.reasons.push(r); b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false'); };
    $('#reasonChips').appendChild(b);
  });
  function low(){ return type === 'first' ? (state.csat != null && state.csat <= 3) || state.fit === 'small' || state.fit === 'large' : (state.result != null && state.result <= 3) || (state.nps != null && state.nps <= 6); }
  function update(){ show($('#qReasons'), low()); show($('#err'), false); }

  $('#form').addEventListener('submit', function(e){
    e.preventDefault();
    var ok = type === 'first' ? state.csat != null : (state.result != null && state.nps != null);
    if(!ok){
      $('#err').textContent = type === 'first' ? 'اختيار التقييم الأول مطلوب عشان نسجّل الرأي.' : 'الإجابة على أول سؤالين مطلوبة عشان نسجّل الرأي.';
      show($('#err'), true); var f = $(type === 'first' ? '#csatStars button' : '#resultStars button'); if(f) f.focus(); return;
    }
    var entry = { orderId:orderId, k:key, type:type, csat: type === 'first' ? state.csat : null, fit: type === 'first' ? state.fit : null, result: type === 'result' ? state.result : null, nps: type === 'result' ? state.nps : null, reasons: low() ? state.reasons.slice() : [], comment: $('#comment').value.trim().slice(0, 600), consent: type === 'result' && $('#consent').checked };
    var btn = $('#submit'); btn.disabled = true;
    function done(){
      $('#doneMsg').textContent = low() ? 'آسفين إن التجربة مكانتش على قد التوقعات. فريقنا هيتواصل قريب عشان نفهم حصل إيه ونحلّها.' : 'الرد وصل لفريقنا، وبيساعدنا نطوّر كل قطعة بنعملها.';
      show($('#form'), false); show($('#done'), true); window.scrollTo(0, 0); $('#done h2').setAttribute('tabindex', '-1'); $('#done h2').focus();
    }
    if(orderId === 'PREVIEW'){ done(); return; }
    fetch('/api/feedback', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(entry) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error || 'حصل خطأ، جرّب تاني'); }); })
      .then(done)
      .catch(function(x){ btn.disabled = false; $('#err').textContent = x.message; show($('#err'), true); });
  });
})();

/* =========================================================
   Универсальная 3-шаговая форма заявки (все сайты)
   Шаг 1 — «Ваш дом», Шаг 2 — «Комплектация», Шаг 3 — «Контакты»
   Самодостаточный модуль: сам встраивает свои стили.
   Интеграция с 3D-конструктором: слушает cfg:change / cfg:lead.
   Отправка: window.__K3D_SEND(text, payload) → window.__K3D_ENDPOINT
             → демо-режим (сообщение об успехе).
   ========================================================= */
(function () {
  'use strict';

  var ACCENT = 'var(--wood, var(--amber, var(--accent, #C0763C)))';
  var CSS = ''
    + '.wiz{max-width:100%;font-family:inherit;color:#1c2430}'
    + '.wiz__head{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}'
    + '.wiz__head h3{margin:0;font-size:1.25rem;line-height:1.2}'
    + '.wiz__steps{display:flex;align-items:center;gap:6px;margin-left:auto}'
    + '.wiz__dot{display:flex;align-items:center;gap:7px;font-size:.78rem;font-weight:700;color:#9aa0a8;letter-spacing:.02em}'
    + '.wiz__dot i{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:.8rem;font-style:normal;background:#eef0f2;color:#7a828c;border:1.5px solid transparent;transition:.25s}'
    + '.wiz__dot.is-active{color:inherit}'
    + '.wiz__dot.is-active i{background:' + ACCENT + ';color:#fff;border-color:' + ACCENT + '}'
    + '.wiz__dot.is-done i{background:rgba(90,190,120,.16);color:#3f9c5f;border-color:rgba(90,190,120,.4)}'
    + '.wiz__bar{height:3px;background:rgba(127,127,127,.35);border-radius:2px;margin-bottom:20px;overflow:hidden}'
    + '.wiz__bar i{display:block;height:100%;width:33.3%;background:' + ACCENT + ';border-radius:2px;transition:width .35s ease}'
    + '.wiz__pane{display:none}'
    + '.wiz__pane.is-on{display:block;animation:wizIn .3s ease}'
    + '@keyframes wizIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'
    + '.wiz__grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}'
    + '.wiz__grid .full{grid-column:1/-1}'
    + '.wiz label{display:block;font-size:.82rem;font-weight:600;margin-bottom:6px;color:inherit;opacity:.85}'
    + '.wiz label .req{color:#e0604a}'
    + '.wiz .input,.wiz select.wiz-el,.wiz textarea.wiz-el{width:100%;box-sizing:border-box;padding:.65rem .8rem;border:1px solid rgba(127,127,127,.4);border-radius:10px;font:inherit;font-size:.95rem;background:#fff;color:#1c2430;transition:border-color .15s,box-shadow .15s}'
    + '.wiz .input:focus,.wiz select.wiz-el:focus,.wiz textarea.wiz-el:focus{outline:none;border-color:' + ACCENT + ';box-shadow:0 0 0 3px rgba(192,118,60,.18)}'
    + '.wiz textarea.wiz-el{min-height:84px;resize:vertical}'
    + '.wiz-chips{display:flex;flex-wrap:wrap;gap:8px}'
    + '.wiz-chip{padding:.5rem .85rem;border:1.5px solid rgba(127,127,127,.45);border-radius:999px;background:rgba(127,127,127,.1);font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;transition:.15s;color:inherit}'
    + '.wiz-chip:hover{border-color:' + ACCENT + '}'
    + '.wiz-chip.is-active{background:' + ACCENT + ';border-color:' + ACCENT + ';color:#fff}'
    + '.wiz__dims{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:rgba(127,127,127,.12);border-radius:12px;padding:12px 14px;margin-bottom:14px}'
    + '.wiz__dims div{font-size:.78rem;color:inherit;opacity:.65}'
    + '.wiz__dims b{display:block;font-size:.95rem;color:inherit;opacity:1;margin-top:2px}'
    + '.wiz__nav{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}'
    + '.wiz__btn{padding:.75rem 1.4rem;border-radius:12px;font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;border:1.5px solid transparent;transition:.15s;display:inline-flex;align-items:center;gap:8px}'
    + '.wiz__btn--next{background:' + ACCENT + ';color:#fff}'
    + '.wiz__btn--next:hover{filter:brightness(1.07)}'
    + '.wiz__btn--back{background:transparent;border-color:rgba(127,127,127,.5);color:inherit}'
    + '.wiz__btn--back:hover{border-color:' + ACCENT + ';color:' + ACCENT + '}'
    + '.wiz__btn[disabled]{opacity:.55;cursor:not-allowed}'
    + '.wiz__err{display:none;background:rgba(208,85,64,.12);border:1px solid rgba(208,85,64,.45);color:#d0604a;border-radius:10px;padding:.7rem .9rem;font-size:.88rem;margin-bottom:14px}'
    + '.wiz__err.is-on{display:block}'
    + '.wiz__ok{display:none;text-align:center;padding:34px 16px}'
    + '.wiz__ok.is-on{display:block;animation:wizIn .35s ease}'
    + '.wiz__ok .tick{width:64px;height:64px;margin:0 auto 14px;border-radius:50%;background:rgba(90,190,120,.18);display:grid;place-items:center;font-size:1.9rem;color:#5bc47f}'
    + '.wiz__ok b{font-size:1.15rem;display:block;margin-bottom:8px}'
    + '.wiz__ok p{color:inherit;opacity:.7;font-size:.92rem;margin:0 0 6px}'
    + '.wiz__sum{background:rgba(127,127,127,.12);border-radius:12px;padding:14px 16px;font-size:.85rem;margin-top:16px}'
    + '.wiz__sum b{display:block;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:8px;font-weight:700}'
    + '.wiz__sum-row{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dashed rgba(127,127,127,.35)}'
    + '.wiz__sum-row:last-child{border-bottom:0}'
    + '.wiz__sum-row span{color:inherit;opacity:.65}'
    + '.wiz__sum-row b{font-weight:700}'
    + '.wiz__price{font-size:1.05rem;color:' + ACCENT + ';opacity:1}'
    + '.wiz__note{font-size:.75rem;color:inherit;opacity:.6;margin-top:10px;line-height:1.45}'
    + '.wiz__note a{color:inherit}'
    + '@media(max-width:560px){.wiz__grid{grid-template-columns:1fr}.wiz__dims{grid-template-columns:1fr 1fr}.wiz__steps{width:100%;margin-left:0;justify-content:space-between}.wiz__dot span{display:none}.wiz__dot.is-active span,.wiz__dot.is-done span{display:inline}}';

  var STEP_TITLES = ['Ваш дом', 'Комплектация', 'Контакты'];

  var ROOF_LABELS = { gable: 'Двускатная', shed: 'Односкатная', hip: 'Вальмовая', mansard: 'Мансардная', flat: 'Плоская' };
  var SPECIES_LABELS = { spruce: 'Ель', pine: 'Сосна', larch: 'Лиственница', glulam: 'Клеёный брус' };
  var COVER_LABELS = { metal: 'Профнастил', tile: 'Металлочерепица', falts: 'Фальцевая', membrane: 'Рулонная' };
  var PROJECTS = ['Каркасный дом', 'Дом с гаражом', 'Баня', 'Только конструкции (домокомплект)', 'Коммерческий объект', 'Пока не решил — посоветуйте'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mount(host) {
    if (!host || host.dataset.wizReady) return;
    host.dataset.wizReady = '1';

    if (!document.getElementById('wiz-style')) {
      var st = document.createElement('style');
      st.id = 'wiz-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    var state = {
      step: 1,
      // из 3D-конструктора (обновляется событиями cfg:change)
      cfg: { length: 9, span: 9, floors: 1, roof: 'gable', species: 'spruce', eave: 0.6, slope: 30, step: 0.9, insulation: 200, covering: 'metal', snow: 'III (2.5)' },
      spec: null,
      project: PROJECTS[0],
    };

    host.innerHTML = ''
      + '<div class="wiz">'
      + '  <div class="wiz__head">'
      + '    <h3>Заявка на расчёт — 3 простых шага</h3>'
      + '    <div class="wiz__steps">'
      + STEP_TITLES.map(function (t, i) {
        return '<div class="wiz__dot" data-dot="' + (i + 1) + '"><i>' + (i + 1) + '</i><span>' + t + '</span></div>';
      }).join('')
      + '    </div>'
      + '  </div>'
      + '  <div class="wiz__bar"><i data-bar></i></div>'

      + '  <div class="wiz__err" data-err></div>'

      /* --- шаг 1: дом --- */
      + '  <div class="wiz__pane" data-pane="1">'
      + '    <label>Что строите</label>'
      + '    <div class="wiz-chips" data-chips="project">'
      + PROJECTS.map(function (p, i) {
        return '<button type="button" class="wiz-chip' + (i === 0 ? ' is-active' : '') + '" data-val="' + esc(p) + '">' + esc(p) + '</button>';
      }).join('')
      + '    </div>'
      + '    <div class="wiz__dims" style="margin-top:14px" data-dims>'
      + '      <div>Габариты<b data-dim-dims>9 × 9 м</b></div>'
      + '      <div>Этажей<b data-dim-floors>1</b></div>'
      + '      <div>Крыша<b data-dim-roof>Двускатная</b></div>'
      + '    </div>'
      + '    <div class="wiz__grid">'
      + '      <div class="full"><label>Регион строительства</label><input class="input" name="region" placeholder="Ленинградская обл."></div>'
      + '      <div class="full wiz__note">Габариты подставлены из 3D-конструктора. Изменить их можно прямо в конструкторе выше — здесь они обновятся автоматически.</div>'
      + '    </div>'
      + '    <div class="wiz__nav"><button type="button" class="wiz__btn wiz__btn--next" data-next>Далее: комплектация →</button></div>'
      + '  </div>'

      /* --- шаг 2: комплектация --- */
      + '  <div class="wiz__pane" data-pane="2">'
      + '    <div class="wiz__grid">'
      + '      <div><label>Порода древесины</label>'
      + '        <select class="wiz-el" name="species">'
      +          Object.keys(SPECIES_LABELS).map(function (k) { return '<option value="' + SPECIES_LABELS[k] + '">' + SPECIES_LABELS[k] + '</option>'; }).join('')
      + '        </select></div>'
      + '      <div><label>Покрытие кровли</label>'
      + '        <select class="wiz-el" name="covering">'
      +          Object.keys(COVER_LABELS).map(function (k) { return '<option value="' + COVER_LABELS[k] + '">' + COVER_LABELS[k] + '</option>'; }).join('')
      + '        </select></div>'
      + '      <div><label>Утеплитель</label>'
      + '        <select class="wiz-el" name="insulation">'
      +          [100, 150, 200, 250, 300].map(function (v) { return '<option value="' + v + ' мм"' + (v === 200 ? ' selected' : '') + '>' + v + ' мм</option>'; }).join('')
      + '        </select></div>'
      + '      <div><label>Сроки строительства</label>'
      + '        <select class="wiz-el" name="timing">'
      +          ['В этом сезоне', '1–3 месяца', '3–6 месяцев', 'Просто узнаю цены'].map(function (v) { return '<option>' + v + '</option>'; }).join('')
      + '        </select></div>'
      + '      <div class="full"><label>Комментарий — участок, бюджет, пожелания</label><textarea class="wiz-el" name="comment" placeholder="Например: участок 8 соток в Гатчине, нужен дом и баня, бюджет до 4 млн"></textarea></div>'
      + '    </div>'
      + '    <div class="wiz__nav">'
      + '      <button type="button" class="wiz__btn wiz__btn--back" data-back>← Назад</button>'
      + '      <button type="button" class="wiz__btn wiz__btn--next" data-next>Далее: контакты →</button>'
      + '    </div>'
      + '  </div>'

      /* --- шаг 3: контакты --- */
      + '  <div class="wiz__pane" data-pane="3">'
      + '    <div class="wiz__grid">'
      + '      <div><label>Ваше имя <span class="req">*</span></label><input class="input" name="name" placeholder="Иван" autocomplete="name"></div>'
      + '      <div><label>Телефон <span class="req">*</span></label><input class="input" name="phone" type="tel" placeholder="+7 900 000-00-00" autocomplete="tel"></div>'
      + '      <div class="full"><label>E-mail (для сметы)</label><input class="input" name="email" type="email" placeholder="mail@example.ru"></div>'
      + '      <div class="full">'
      + '        <label class="wiz__note" style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">'
      + '          <input type="checkbox" name="consent" style="width:17px;height:17px;margin-top:2px;accent-color:' + ACCENT + '">'
      + '          <span>Согласен на обработку персональных данных и получение ответа по заявке</span>'
      + '        </label>'
      + '      </div>'
      + '    </div>'
      + '    <div class="wiz__sum" data-sum></div>'
      + '    <div class="wiz__nav">'
      + '      <button type="button" class="wiz__btn wiz__btn--back" data-back>← Назад</button>'
      + '      <button type="button" class="wiz__btn wiz__btn--next" data-send>Отправить заявку</button>'
      + '    </div>'
      + '    <p class="wiz__note">Нажимая «Отправить заявку», вы соглашаетесь с политикой обработки персональных данных. Никакого спама — только ответ по вашей заявке.</p>'
      + '  </div>'

      /* --- успех --- */
      + '  <div class="wiz__ok" data-ok>'
      + '    <div class="tick">✓</div>'
      + '    <b>Заявка отправлена!</b>'
      + '    <p>Мы свяжемся с вами в течение рабочего дня.</p>'
      + '    <p data-ok-note></p>'
      + '  </div>'
      + '</div>';

    var $ = function (sel) { return host.querySelector(sel); };
    var $$ = function (sel) { return Array.prototype.slice.call(host.querySelectorAll(sel)); };
    var panes = $$('[data-pane]');
    var dots = $$('[data-dot]');
    var bar = $('[data-bar]');
    var err = $('[data-err]');
    var okPane = $('[data-ok]');

    function show(n) {
      state.step = n;
      panes.forEach(function (p) { p.classList.toggle('is-on', p.dataset.pane === String(n)); });
      dots.forEach(function (d) {
        var i = +d.dataset.dot;
        d.classList.toggle('is-active', i === n);
        d.classList.toggle('is-done', i < n);
      });
      bar.style.width = (n / 3 * 100) + '%';
      err.classList.remove('is-on');
      if (n === 3) paintSummary();
    }

    function fail(msg) {
      err.textContent = msg;
      err.classList.add('is-on');
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* чипы «что строите» */
    $$('[data-chips="project"] .wiz-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        $$('[data-chips="project"] .wiz-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        state.project = chip.dataset.val;
      });
    });

    function validateStep(n) {
      if (n === 1) return true;
      if (n === 2) return true;
      var name = host.querySelector('[name=name]').value.trim();
      var phone = host.querySelector('[name=phone]').value.trim();
      var consent = host.querySelector('[name=consent]').checked;
      if (!name) { fail('Укажите имя'); return false; }
      if (phone.replace(/\D/g, '').length < 10) { fail('Укажите корректный телефон'); return false; }
      if (!consent) { fail('Нужно согласие на обработку персональных данных'); return false; }
      return true;
    }

    function paintSummary() {
      var c = state.cfg, s = state.spec || {};
      var rows = [
        ['Что строите', state.project],
        ['Габариты', c.length + ' × ' + c.span + ' м · ' + c.floors + ' ' + (c.floors === 1 ? 'этаж' : 'этажа')],
        ['Крыша', ROOF_LABELS[c.roof] || c.roof],
        ['Древесина', SPECIES_LABELS[c.species] || c.species],
        ['Кровля (покрытие)', COVER_LABELS[c.covering] || c.covering],
        ['Утеплитель', c.insulation + ' мм'],
        ['Площадь', s.totalArea ? s.totalArea + ' м²' : '—'],
        ['Строительство', (host.querySelector('[name=timing]') || {}).value || '—'],
      ];
      var html = '<b>Ваша конфигурация</b>' + rows.map(function (r) {
        return '<div class="wiz__sum-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
      }).join('');
      if (s.price) {
        html += '<div class="wiz__sum-row"><span>Ориентировочно</span><b class="wiz__price">' + esc(Number(s.price).toLocaleString('ru-RU')) + ' ₽</b></div>';
      }
      $('[data-sum]').innerHTML = html;
    }

    /* навигация */
    $$('[data-next]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!validateStep(state.step)) return;
        show(state.step + 1);
      });
    });
    $$('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { show(state.step - 1); });
    });

    /* отправка */
    $('[data-send]').addEventListener('click', function () {
      if (!validateStep(3)) return;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Отправляем…';

      var data = {};
      $$('[name]').forEach(function (el) { if (el.type !== 'checkbox') data[el.name] = el.value; });
      var c = state.cfg, s = state.spec || {};
      data.length = c.length + ' м';
      data.span = c.span + ' м';
      data.floors = c.floors;
      data.roof = ROOF_LABELS[c.roof] || c.roof;
      data.eave = c.eave + ' м';
      data.slope = c.slope + '°';
      data.stepCfg = c.step + ' м';
      data.snow = c.snow;
      data.project = state.project;
      data.spec = s;
      data.source = '3-шаговая форма';

      var text = 'Новая заявка (' + state.project + ')\n'
        + 'Имя: ' + (data.name || '—') + '\n'
        + 'Телефон: ' + (data.phone || '—') + '\n'
        + 'E-mail: ' + (data.email || '—') + '\n'
        + 'Регион: ' + (data.region || '—') + '\n'
        + 'Дом: ' + c.length + '×' + c.span + ' м, ' + c.floors + ' эт., крыша ' + data.roof + '\n'
        + 'Материал: ' + data.species + ', утеплитель ' + c.insulation + ' мм, покрытие ' + data.covering + '\n'
        + 'Сроки: ' + (data.timing || '—') + '\n'
        + (s.price ? ('Ориентировочный расчёт: ' + Number(s.price).toLocaleString('ru-RU') + ' ₽, ' + (s.days || '') + '\n') : '')
        + 'Комментарий: ' + (data.comment || '—');

      function done(note) {
        panes.forEach(function (p) { p.classList.remove('is-on'); });
        dots.forEach(function (d) { d.classList.toggle('is-done', true); });
        okPane.classList.add('is-on');
        $('[data-ok-note]').textContent = note || '';
        okPane.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      /* посетитель всегда видит нейтральное подтверждение; подсказка о подключении
         отправки — только в консоль, для владельца сайта */
      function ownerHint(msg) {
        try { console.warn('Форма заявки: ' + msg); } catch (e) { /* консоль недоступна — ничего не делаем */ }
      }

      if (typeof window.__K3D_SEND === 'function') {
        window.__K3D_SEND(text, data).then(function (res) {
          if (res === 'demo') {
            ownerHint('демо-режим — подключите Telegram-бота в настройках сайта, и заявки будут приходить сразу.');
            done('Заявка подготовлена в письме — просто отправьте его, и мы свяжемся с вами.');
          } else done();
        }).catch(function () {
          done('Но что-то пошло не так при отправке — позвоните нам, пожалуйста.');
        });
        return;
      }
      if (window.__K3D_ENDPOINT) {
        fetch(window.__K3D_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, payload: data }),
        }).then(function (r) { if (!r.ok) throw new Error(r.status); done(); })
          .catch(function () { done('Но что-то пошло не так при отправке — позвоните нам, пожалуйста.'); });
        btn.disabled = false; btn.textContent = 'Отправить заявку';
        return;
      }
      /* демо-режим без бэкенда: заявка никуда не уходит */
      ownerHint('демо-режим без бэкенда — укажите window.__K3D_ENDPOINT или __K3D_SEND, иначе заявки не приходят.');
      setTimeout(function () {
        done('');
        btn.disabled = false; btn.textContent = 'Отправить заявку';
      }, 500);
    });

    /* интеграция с 3D-конструктором */
    document.addEventListener('cfg:change', function (e) {
      if (!e.detail) return;
      var p = e.detail.params || {}, s = e.detail.spec || {};
      ['length', 'span', 'floors', 'roof', 'species', 'eave', 'slope', 'step', 'insulation', 'covering'].forEach(function (k) {
        if (p[k] !== undefined) state.cfg[k] = p[k];
      });
      if (p.snow !== undefined) state.cfg.snow = 'район ' + p.snow;
      state.spec = s;
      $('[data-dim-dims]').textContent = p.length + ' × ' + p.span + ' м';
      $('[data-dim-floors]').textContent = p.floors;
      $('[data-dim-roof]').textContent = ROOF_LABELS[p.roof] || p.roof;
      var selSp = host.querySelector('[name=species]');
      if (selSp && SPECIES_LABELS[p.species]) selSp.value = SPECIES_LABELS[p.species];
      var selCov = host.querySelector('[name=covering]');
      if (selCov && COVER_LABELS[p.covering]) selCov.value = COVER_LABELS[p.covering];
      var selIns = host.querySelector('[name=insulation]');
      if (selIns && p.insulation) selIns.value = p.insulation + ' мм';
      if (state.step === 3) paintSummary();
    });

    show(1);
  }

  function boot() {
    document.querySelectorAll('#lead-wizard').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

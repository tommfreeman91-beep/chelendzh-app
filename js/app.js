(function () {
  'use strict';

  var STORAGE_KEY = 'cw_data_v1';

  // ---------- date helpers ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDate(s) {
    var parts = s.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  function todayStr() { return fmtDate(new Date()); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function addMonths(d, n) { var r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
  function mondayOf(d) {
    var r = new Date(d);
    var day = r.getDay(); // 0 Sun .. 6 Sat
    var diff = (day === 0 ? -6 : 1 - day);
    r.setDate(r.getDate() + diff);
    r.setHours(0, 0, 0, 0);
    return r;
  }
  function monthKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  var MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTH_NAMES_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  function fmtHuman(d) { return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear(); }

  function challengeMonthIndexRaw(dateStr, startStr) {
    var d = parseDate(dateStr), s = parseDate(startStr);
    return (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth()) + 1;
  }
  function challengeMonthIndex(dateStr, startStr) {
    var idx = challengeMonthIndexRaw(dateStr, startStr);
    if (idx < 1) idx = 1;
    if (idx > 6) idx = 6;
    return idx;
  }

  // ---------- data store ----------
  function defaultData() {
    return {
      settings: {
        targetIncome: 1000000,
        flagshipPrice: 500000,
        testPrice: 50000,
        maxClientsMin: 3,
        maxClientsMax: 5,
        startDate: todayStr()
      },
      days: {},
      weeks: {},
      months: {},
      streams: []
    };
  }

  var data = loadData();

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      var parsed = JSON.parse(raw);
      var d = defaultData();
      d.settings = Object.assign(d.settings, parsed.settings || {});
      d.days = parsed.days || {};
      d.weeks = parsed.weeks || {};
      d.months = parsed.months || {};
      d.streams = parsed.streams || [];
      return d;
    } catch (e) {
      console.error('Не удалось прочитать данные', e);
      return defaultData();
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Не удалось сохранить данные', e);
      alert('Не получилось сохранить данные. Возможно, закончилось место в хранилище браузера.');
    }
  }

  function getDay(dateStr) {
    if (!data.days[dateStr]) {
      data.days[dateStr] = {
        reels: false, stories: false, tgPost: false, threads: 0,
        commentChannels: 0, commentsTotal: 0,
        baseContacts: 0,
        leads: 0, calls: 0, testSales: 0, flagshipSales: 0,
        diary: ''
      };
    }
    return data.days[dateStr];
  }

  function getWeek(mondayStr) {
    if (!data.weeks[mondayStr]) {
      data.weeks[mondayStr] = {
        meditation: 0, reading: 0,
        abundanceCheck: false, abundanceNote: '',
        blocks: '', nextGoal: ''
      };
    }
    return data.weeks[mondayStr];
  }

  function getMonth(key) {
    if (!data.months[key]) {
      data.months[key] = { ads: [], summary: '' };
    }
    return data.months[key];
  }

  // ---------- app state ----------
  var state = {
    view: 'dashboard',
    todayDate: todayStr(),
    weekMonday: fmtDate(mondayOf(new Date())),
    monthDate: fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    streamId: null
  };

  // ---------- generic dom helpers ----------
  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function numVal(id) { var v = parseFloat($(id).value); return isNaN(v) ? 0 : v; }
  function setNum(id, v) { $(id).value = (v || 0); }
  function checkVal(id) { return $(id).checked; }
  function setCheck(id, v) { $(id).checked = !!v; }
  function textVal(id) { return $(id).value; }
  function setText(id, v) { $(id).value = v || ''; }
  function fmtMoney(n) {
    n = Math.round(n || 0);
    return n.toLocaleString('ru-RU') + ' ₽';
  }
  function pct(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Math.round(n * 100) + '%';
  }

  function flashStatus(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ''; }, 1600);
  }

  // ---------- navigation ----------
  var VIEW_ALIASES = { 'stream': 'stream-list' };

  function navigate(view, params) {
    if (VIEW_ALIASES[view]) view = VIEW_ALIASES[view];
    state.view = view;
    if (params && params.streamId !== undefined) state.streamId = params.streamId;

    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('active', el.dataset.view === view);
    });
    document.querySelectorAll('.tab').forEach(function (el) {
      var nav = el.dataset.nav;
      var isActive = nav === view || (nav === 'stream-list' && view === 'stream-detail');
      el.classList.toggle('active', isActive);
    });

    var titles = {
      dashboard: 'Челлендж', today: 'Сегодня', week: 'Неделя', month: 'Месяц',
      'stream-list': 'Эфиры', 'stream-detail': 'Эфир', settings: 'Настройки'
    };
    $('topbar-title').textContent = titles[view] || 'Челлендж';

    if (view === 'dashboard') renderDashboard();
    if (view === 'today') renderToday();
    if (view === 'week') renderWeek();
    if (view === 'month') renderMonth();
    if (view === 'stream-list') renderStreamList();
    if (view === 'stream-detail') renderStreamDetail();
    if (view === 'settings') renderSettings();

    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-nav]').forEach(function (el) {
    on(el, 'click', function () { navigate(el.dataset.nav); });
  });
  on($('btn-open-settings'), 'click', function () { navigate('settings'); });
  on($('btn-open-dashboard'), 'click', function () { navigate('dashboard'); });

  // ================= DASHBOARD =================
  function renderDashboard() {
    var s = data.settings;
    var todayIdx = challengeMonthIndex(todayStr(), s.startDate);
    var rawIdx = challengeMonthIndexRaw(todayStr(), s.startDate);
    var daysSinceStart = Math.floor((parseDate(todayStr()) - parseDate(s.startDate)) / 86400000) + 1;

    $('dash-month-num').textContent = todayIdx;
    $('dash-day-num').textContent = Math.max(daysSinceStart, 1);
    $('dash-start-date').textContent = fmtHuman(parseDate(s.startDate));

    var salesSoFar = totalFlagshipSalesSince(s.startDate);
    var required = Math.max(1, Math.ceil(s.targetIncome / s.flagshipPrice));
    var remaining = Math.max(required - salesSoFar, 0);
    var monthsRemaining = Math.max(6 - rawIdx + 1, rawIdx > 6 ? 0 : 1);

    $('dash-sales-so-far').textContent = salesSoFar;
    $('dash-sales-needed').textContent = required;
    var fillPct = Math.min(100, Math.round((salesSoFar / required) * 100));
    $('dash-progress-fill').style.width = fillPct + '%';
    $('dash-progress-big').textContent = fillPct + '%';

    var note;
    if (rawIdx > 6) {
      note = remaining === 0 ? 'Челлендж завершён, цель достигнута 🎉' : 'Челлендж завершён. Не хватило ' + remaining + ' продаж флагмана.';
    } else if (remaining === 0) {
      note = 'Цель по числу флагман-продаж уже выполнена!';
    } else {
      var avg = monthsRemaining > 0 ? (remaining / monthsRemaining) : remaining;
      note = 'Нужно ещё ' + remaining + ' продаж флагмана · ~' + round1(avg) + ' в месяц (' + monthsRemaining + ' мес. осталось)';
    }
    $('dash-progress-note').textContent = note;

    var day = data.days[todayStr()];
    var mini = $('dash-today-mini');
    mini.innerHTML = '';
    var items = [
      ['Заявки', day ? day.leads : 0],
      ['Разборы', day ? day.calls : 0],
      ['Продажи теста', day ? day.testSales : 0],
      ['Продажи флагмана', day ? day.flagshipSales : 0]
    ];
    items.forEach(function (it) {
      var div = document.createElement('div');
      div.className = 'mini-item';
      div.innerHTML = '<b>' + it[1] + '</b>' + it[0];
      mini.appendChild(div);
    });
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function totalFlagshipSalesSince(startStr) {
    var sum = 0;
    Object.keys(data.days).forEach(function (k) {
      if (k >= startStr) sum += (data.days[k].flagshipSales || 0);
    });
    return sum;
  }

  // ================= СЕГОДНЯ =================
  function renderToday() {
    $('today-date-input').value = state.todayDate;
    var day = getDay(state.todayDate);
    setCheck('f-reels', day.reels);
    setCheck('f-stories', day.stories);
    setCheck('f-tg-post', day.tgPost);
    setNum('f-threads', day.threads);
    setNum('f-comment-channels', day.commentChannels);
    setNum('f-comments-total', day.commentsTotal);
    setNum('f-base-contacts', day.baseContacts);
    setNum('f-leads', day.leads);
    setNum('f-calls', day.calls);
    setNum('f-test-sales', day.testSales);
    setNum('f-flagship-sales', day.flagshipSales);
    setText('f-diary', day.diary);
    renderDiaryHistory();
  }

  function saveTodayField() {
    var day = getDay(state.todayDate);
    day.reels = checkVal('f-reels');
    day.stories = checkVal('f-stories');
    day.tgPost = checkVal('f-tg-post');
    day.threads = numVal('f-threads');
    day.commentChannels = numVal('f-comment-channels');
    day.commentsTotal = numVal('f-comments-total');
    day.baseContacts = numVal('f-base-contacts');
    day.leads = numVal('f-leads');
    day.calls = numVal('f-calls');
    day.testSales = numVal('f-test-sales');
    day.flagshipSales = numVal('f-flagship-sales');
    day.diary = textVal('f-diary');
    saveData();
  }

  function renderDiaryHistory() {
    var wrap = $('diary-history');
    var keys = Object.keys(data.days).filter(function (k) {
      return k !== state.todayDate && data.days[k].diary && data.days[k].diary.trim();
    }).sort().reverse();
    if (!keys.length) {
      wrap.innerHTML = '<div class="diary-empty">Пока нет других записей</div>';
      return;
    }
    wrap.innerHTML = '';
    keys.forEach(function (k) {
      var entry = document.createElement('div');
      entry.className = 'diary-entry';
      var d = parseDate(k);
      var preview = data.days[k].diary;
      entry.innerHTML = '<div class="diary-entry-date">' + fmtHuman(d) + '</div>' +
        '<div class="diary-entry-text" data-full="false"></div>';
      var textEl = entry.querySelector('.diary-entry-text');
      var short = preview.length > 140 ? preview.slice(0, 140) + '…' : preview;
      textEl.textContent = short;
      entry.addEventListener('click', function () {
        var expanded = textEl.dataset.full === 'true';
        if (expanded) {
          textEl.textContent = short;
          textEl.dataset.full = 'false';
        } else {
          textEl.textContent = preview;
          textEl.dataset.full = 'true';
        }
      });
      wrap.appendChild(entry);
    });
  }

  ['f-reels', 'f-stories', 'f-tg-post', 'f-threads', 'f-comment-channels', 'f-comments-total',
    'f-base-contacts', 'f-leads', 'f-calls', 'f-test-sales', 'f-flagship-sales'].forEach(function (id) {
    on($(id), 'change', function () { saveTodayField(); });
  });
  var diaryTimer = null;
  on($('f-diary'), 'input', function () {
    clearTimeout(diaryTimer);
    diaryTimer = setTimeout(saveTodayField, 400);
  });
  on($('today-save'), 'click', function () {
    saveTodayField();
    flashStatus('today-save-status', 'Сохранено ✓');
    renderDiaryHistory();
  });
  on($('today-date-input'), 'change', function () {
    state.todayDate = $('today-date-input').value || todayStr();
    renderToday();
  });
  on($('today-prev-day'), 'click', function () {
    state.todayDate = fmtDate(addDays(parseDate(state.todayDate), -1));
    renderToday();
  });
  on($('today-next-day'), 'click', function () {
    state.todayDate = fmtDate(addDays(parseDate(state.todayDate), 1));
    renderToday();
  });

  // number inputs: select all on focus for fast entry
  document.querySelectorAll('input[type="number"]').forEach(function (inp) {
    on(inp, 'focus', function () { inp.select(); });
  });

  // ================= НЕДЕЛЯ =================
  function renderWeek() {
    var monday = parseDate(state.weekMonday);
    var sunday = addDays(monday, 6);
    $('week-range-label').textContent = fmtHuman(monday) + ' – ' + fmtHuman(sunday);

    var w = getWeek(state.weekMonday);
    setNum('w-meditation', w.meditation);
    setNum('w-reading', w.reading);
    setCheck('w-abundance-check', w.abundanceCheck);
    setText('w-abundance-note', w.abundanceNote);
    setText('w-blocks', w.blocks);
    setText('w-next-goal', w.nextGoal);

    renderWeekFunnel(monday);
  }

  function renderWeekFunnel(monday) {
    var leads = 0, calls = 0, testSales = 0, flagshipSales = 0;
    for (var i = 0; i < 7; i++) {
      var k = fmtDate(addDays(monday, i));
      var d = data.days[k];
      if (d) {
        leads += d.leads || 0;
        calls += d.calls || 0;
        testSales += d.testSales || 0;
        flagshipSales += d.flagshipSales || 0;
      }
    }
    var leadToCall = leads > 0 ? calls / leads : null;
    var callToTest = calls > 0 ? testSales / calls : null;
    var callToFlagship = calls > 0 ? flagshipSales / calls : null;

    var wrap = $('week-funnel');
    wrap.innerHTML =
      '<div class="funnel-step"><span>Заявки</span><b>' + leads + '</b></div>' +
      '<div class="funnel-step"><span>→ Разборы</span><b>' + calls + ' (' + pct(leadToCall) + ')</b></div>' +
      '<div class="funnel-step"><span>→ Продажи теста</span><b>' + testSales + ' (' + pct(callToTest) + ')</b></div>' +
      '<div class="funnel-step"><span>→ Продажи флагмана</span><b>' + flagshipSales + ' (' + pct(callToFlagship) + ')</b></div>';
  }

  function saveWeekField() {
    var w = getWeek(state.weekMonday);
    w.meditation = numVal('w-meditation');
    w.reading = numVal('w-reading');
    w.abundanceCheck = checkVal('w-abundance-check');
    w.abundanceNote = textVal('w-abundance-note');
    w.blocks = textVal('w-blocks');
    w.nextGoal = textVal('w-next-goal');
    saveData();
  }
  ['w-meditation', 'w-reading', 'w-abundance-check'].forEach(function (id) {
    on($(id), 'change', saveWeekField);
  });
  var weekTextTimer = null;
  ['w-abundance-note', 'w-blocks', 'w-next-goal'].forEach(function (id) {
    on($(id), 'input', function () {
      clearTimeout(weekTextTimer);
      weekTextTimer = setTimeout(saveWeekField, 400);
    });
  });
  on($('week-save'), 'click', function () {
    saveWeekField();
    flashStatus('week-save-status', 'Сохранено ✓');
  });
  on($('week-prev'), 'click', function () {
    state.weekMonday = fmtDate(addDays(parseDate(state.weekMonday), -7));
    renderWeek();
  });
  on($('week-next'), 'click', function () {
    state.weekMonday = fmtDate(addDays(parseDate(state.weekMonday), 7));
    renderWeek();
  });

  // ================= МЕСЯЦ =================
  function renderMonth() {
    var mDate = parseDate(state.monthDate);
    var key = monthKey(mDate);
    $('month-label').textContent = MONTH_NAMES_NOM[mDate.getMonth()] + ' ' + mDate.getFullYear();

    var m = getMonth(key);
    setText('month-summary', m.summary);

    renderAdList(key);
    renderMonthStats(key);
    renderMonthProgress();
  }

  function renderAdList(key) {
    var m = getMonth(key);
    var wrap = $('ad-list');
    wrap.innerHTML = '';
    if (!m.ads.length) {
      wrap.innerHTML = '<div class="diary-empty">Расходов пока нет</div>';
    } else {
      m.ads.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (ad) {
        var row = document.createElement('div');
        row.className = 'ad-item';
        row.innerHTML = '<span>' + fmtMoney(ad.amount) + (ad.label ? ' · ' + escapeHtml(ad.label) : '') +
          '<span class="ad-item-meta"> · ' + fmtHuman(parseDate(ad.date)) + '</span></span>' +
          '<button class="ad-item-del" data-id="' + ad.id + '">✕</button>';
        wrap.appendChild(row);
      });
    }
    var total = m.ads.reduce(function (s, a) { return s + (a.amount || 0); }, 0);
    $('ad-total').textContent = 'Сумма за месяц: ' + fmtMoney(total);

    wrap.querySelectorAll('.ad-item-del').forEach(function (btn) {
      on(btn, 'click', function () {
        var id = btn.dataset.id;
        m.ads = m.ads.filter(function (a) { return a.id !== id; });
        saveData();
        renderAdList(key);
        renderMonthStats(key);
      });
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderMonthStats(key) {
    var m = getMonth(key);
    var totalAdSpend = m.ads.reduce(function (s, a) { return s + (a.amount || 0); }, 0);

    var leads = 0, testSales = 0;
    Object.keys(data.days).forEach(function (k) {
      if (k.indexOf(key) === 0) {
        leads += data.days[k].leads || 0;
        testSales += data.days[k].testSales || 0;
      }
    });

    var costPerLead = (totalAdSpend > 0 && leads > 0) ? totalAdSpend / leads : null;
    var costPerTest = (totalAdSpend > 0 && testSales > 0) ? totalAdSpend / testSales : null;

    var grid = $('month-stats');
    grid.innerHTML =
      statItem('Расход на трафик', fmtMoney(totalAdSpend)) +
      statItem('Заявок за месяц', leads) +
      statItem('Цена заявки', costPerLead === null ? '—' : fmtMoney(costPerLead)) +
      statItem('Цена продажи теста', costPerTest === null ? '—' : fmtMoney(costPerTest));
  }

  function statItem(label, value) {
    return '<div class="stat-item"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div></div>';
  }

  function renderMonthProgress() {
    var s = data.settings;
    var rawIdx = challengeMonthIndexRaw(todayStr(), s.startDate);
    var salesSoFar = totalFlagshipSalesSince(s.startDate);
    var required = Math.max(1, Math.ceil(s.targetIncome / s.flagshipPrice));
    var remaining = Math.max(required - salesSoFar, 0);
    var monthsRemaining = Math.max(6 - rawIdx + 1, rawIdx > 6 ? 0 : 1);
    var avg = monthsRemaining > 0 ? remaining / monthsRemaining : remaining;

    var grid = $('month-progress');
    grid.innerHTML =
      statItem('Продано флагманов всего', salesSoFar) +
      statItem('Нужно всего (для цели)', required) +
      statItem('Осталось месяцев', Math.max(monthsRemaining, 0)) +
      statItem('Нужно продаж в среднем/мес', round1(avg));
  }

  function saveMonthSummary() {
    var key = monthKey(parseDate(state.monthDate));
    var m = getMonth(key);
    m.summary = textVal('month-summary');
    saveData();
  }
  var monthTextTimer = null;
  on($('month-summary'), 'input', function () {
    clearTimeout(monthTextTimer);
    monthTextTimer = setTimeout(saveMonthSummary, 400);
  });
  on($('month-save'), 'click', function () {
    saveMonthSummary();
    flashStatus('month-save-status', 'Сохранено ✓');
  });
  on($('month-prev'), 'click', function () {
    state.monthDate = fmtDate(addMonths(parseDate(state.monthDate), -1));
    renderMonth();
  });
  on($('month-next'), 'click', function () {
    state.monthDate = fmtDate(addMonths(parseDate(state.monthDate), 1));
    renderMonth();
  });
  on($('ad-add'), 'click', function () {
    var amount = parseFloat($('ad-amount').value);
    var dateStr = $('ad-date').value;
    var label = $('ad-label').value.trim();
    if (!amount || amount <= 0) { alert('Укажи сумму расхода'); return; }
    if (!dateStr) { dateStr = todayStr(); }
    var key = monthKey(parseDate(state.monthDate));
    var m = getMonth(key);
    m.ads.push({ id: 'ad_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), amount: amount, date: dateStr, label: label });
    saveData();
    $('ad-amount').value = '';
    $('ad-label').value = '';
    renderAdList(key);
    renderMonthStats(key);
  });

  // ================= ЭФИРЫ =================
  var STREAM_TASKS = ['offer_topic', 'offer_structure', 'chat_create', 'chat_posts', 'chat_warmup',
    'partners_list', 'partners_links', 'traffic_launch', 'bring_people', 'warmup_people',
    'hold_stream', 'post_calls_invite', 'post_materials', 'post_calls_hold'];

  function newStream() {
    var d = todayStr();
    var tasks = {};
    STREAM_TASKS.forEach(function (t) { tasks[t] = false; });
    var s = {
      id: 'stream_' + Date.now(),
      title: '',
      date: d,
      tasks: tasks,
      viewers: 0,
      signups: 0,
      appliedCalls: 0,
      createdAt: Date.now()
    };
    data.streams.push(s);
    saveData();
    return s;
  }

  function renderStreamList() {
    var wrap = $('stream-list');
    var list = data.streams.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (!list.length) {
      wrap.innerHTML = '<div class="stream-empty">Эфиров пока нет. Нажми «Новый эфир», чтобы начать подготовку.</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach(function (s) {
      var done = STREAM_TASKS.filter(function (t) { return s.tasks[t]; }).length;
      var card = document.createElement('div');
      card.className = 'stream-card';
      card.innerHTML =
        '<div class="stream-card-title">' + (s.title ? escapeHtml(s.title) : 'Без названия') + '</div>' +
        '<div class="stream-card-meta">' + fmtHuman(parseDate(s.date)) + ' · подготовка ' + done + '/' + STREAM_TASKS.length + '</div>' +
        '<div class="stream-card-progress">' + s.viewers + ' на эфире · ' + s.signups + ' записались на разбор</div>';
      card.addEventListener('click', function () { navigate('stream-detail', { streamId: s.id }); });
      wrap.appendChild(card);
    });
  }

  on($('stream-new'), 'click', function () {
    var s = newStream();
    navigate('stream-detail', { streamId: s.id });
  });
  on($('stream-back'), 'click', function () { navigate('stream-list'); });

  function currentStream() {
    return data.streams.find(function (s) { return s.id === state.streamId; });
  }

  function renderStreamDetail() {
    var s = currentStream();
    if (!s) { navigate('stream-list'); return; }
    setText('stream-title', s.title);
    $('stream-date').value = s.date;
    STREAM_TASKS.forEach(function (t) {
      var el = document.querySelector('[data-task="' + t + '"]');
      if (el) el.checked = !!s.tasks[t];
    });
    setNum('stream-viewers', s.viewers);
    setNum('stream-signups', s.signups);
  }

  function saveStreamField() {
    var s = currentStream();
    if (!s) return;
    s.title = textVal('stream-title');
    s.date = $('stream-date').value || s.date;
    STREAM_TASKS.forEach(function (t) {
      var el = document.querySelector('[data-task="' + t + '"]');
      if (el) s.tasks[t] = el.checked;
    });
    s.viewers = numVal('stream-viewers');

    var newSignups = numVal('stream-signups');
    var prevApplied = s.appliedCalls || 0;
    var diff = newSignups - prevApplied;
    if (diff !== 0 && s.date) {
      var day = getDay(s.date);
      day.calls = Math.max(0, (day.calls || 0) + diff);
    }
    s.signups = newSignups;
    s.appliedCalls = newSignups;

    saveData();
  }

  on($('stream-title'), 'change', saveStreamField);
  on($('stream-date'), 'change', saveStreamField);
  on($('stream-viewers'), 'change', saveStreamField);
  on($('stream-signups'), 'change', saveStreamField);
  document.querySelectorAll('[data-task]').forEach(function (el) {
    on(el, 'change', saveStreamField);
  });
  on($('stream-save'), 'click', function () {
    saveStreamField();
    flashStatus('stream-save-status', 'Сохранено ✓');
    renderStreamList();
  });
  on($('stream-delete'), 'click', function () {
    var s = currentStream();
    if (!s) return;
    if (!confirm('Удалить этот эфир? Записи в дневном чек-листе (разборы) останутся как есть.')) return;
    data.streams = data.streams.filter(function (x) { return x.id !== s.id; });
    saveData();
    navigate('stream-list');
  });

  // ================= НАСТРОЙКИ =================
  function renderSettings() {
    var s = data.settings;
    setNum('s-target-income', s.targetIncome);
    setNum('s-flagship-price', s.flagshipPrice);
    setNum('s-test-price', s.testPrice);
    setNum('s-max-clients-min', s.maxClientsMin);
    setNum('s-max-clients-max', s.maxClientsMax);
    $('s-start-date').value = s.startDate;
  }

  function saveSettings() {
    var s = data.settings;
    s.targetIncome = numVal('s-target-income') || 1000000;
    s.flagshipPrice = numVal('s-flagship-price') || 500000;
    s.testPrice = numVal('s-test-price') || 50000;
    s.maxClientsMin = numVal('s-max-clients-min') || 0;
    s.maxClientsMax = numVal('s-max-clients-max') || 0;
    s.startDate = $('s-start-date').value || todayStr();
    saveData();
  }
  on($('s-save'), 'click', function () {
    saveSettings();
    flashStatus('s-save-status', 'Сохранено ✓');
    renderDashboard();
  });

  on($('s-export'), 'click', function () {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'chelendzh-data-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  on($('s-import-btn'), 'click', function () { $('s-import-file').click(); });
  on($('s-import-file'), 'change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.settings) {
          throw new Error('bad format');
        }
        if (!confirm('Импорт заменит все текущие данные в приложении. Продолжить?')) return;
        data.settings = Object.assign(defaultData().settings, parsed.settings || {});
        data.days = parsed.days || {};
        data.weeks = parsed.weeks || {};
        data.months = parsed.months || {};
        data.streams = parsed.streams || [];
        saveData();
        alert('Данные импортированы.');
        navigate('dashboard');
      } catch (err) {
        alert('Не получилось прочитать файл. Убедись, что это JSON-экспорт этого приложения.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  on($('s-reset'), 'click', function () {
    if (!confirm('Это удалит ВСЕ данные приложения без возможности восстановления. Точно продолжить?')) return;
    if (!confirm('Последнее предупреждение: все дни, недели, месяцы и эфиры будут стёрты. Продолжить?')) return;
    localStorage.removeItem(STORAGE_KEY);
    data = defaultData();
    navigate('dashboard');
  });

  // ================= INIT =================
  navigate('dashboard');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service worker не зарегистрирован (это нормально при открытии файла напрямую):', err);
      });
    });
  }
})();

(function () {
  'use strict';

  var STORAGE_KEY = 'cw_data_v1';
  var FUNNEL_API = '/api/funnel-proxy';
  // Автоматическая часть воронки требует серверную функцию (см. api/funnel-proxy.js),
  // которая пока не задеплоена (сайт временно на GitHub Pages, без серверной части).
  // Включи это, когда приложение переедет на Vercel — см. README.
  var FUNNEL_AUTO_ENABLED = false;

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
  function dayNumberFor(dateStr) {
    return Math.floor((parseDate(dateStr) - parseDate(data.settings.startDate)) / 86400000) + 1;
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
        startDate: todayStr(),
        contentPillars: ['Возражения и анти-шум', 'Кейсы клиентов', 'Психология денег', 'Закулисье менторства', 'Личный бренд Tomm Freeman'],
        competitorChannels: []
      },
      days: {},
      weeks: {},
      months: {},
      streams: [],
      contacts: [],
      payments: [],
      funnelCache: { data: null, lastSuccess: null, lastError: false, history: [] }
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
      d.contacts = parsed.contacts || [];
      d.payments = parsed.payments || [];
      d.funnelCache = Object.assign(d.funnelCache, parsed.funnelCache || {});
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
    if (!data.days[dateStr]) data.days[dateStr] = {};
    var d = data.days[dateStr];
    if (d.reels === undefined) d.reels = false;
    if (d.stories === undefined) d.stories = false;
    if (d.tgPost === undefined) d.tgPost = false;
    if (d.threads === undefined) d.threads = 0;
    if (d.contentPillar === undefined) d.contentPillar = '';
    if (d.commentedChannels === undefined) d.commentedChannels = [];
    if (d.commentsTotal === undefined) d.commentsTotal = 0;
    if (d.baseContacts === undefined) d.baseContacts = 0;
    if (d.calls === undefined) d.calls = 0;
    if (d.testSales === undefined) d.testSales = 0;
    if (d.flagshipSales === undefined) d.flagshipSales = 0;
    if (d.stageNote === undefined) d.stageNote = '';
    if (d.diary === undefined) d.diary = '';
    return d;
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
    if (!data.months[key]) data.months[key] = {};
    var m = data.months[key];
    if (m.summary === undefined) m.summary = '';
    return m;
  }

  // ---------- app state ----------
  var state = {
    view: 'dashboard',
    todayDate: todayStr(),
    weekMonday: fmtDate(mondayOf(new Date())),
    monthDate: fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    streamId: null,
    contactId: null,
    paymentClientId: null
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
  function round1(n) { return Math.round(n * 10) / 10; }
  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  function statItem(label, value) {
    return '<div class="stat-item"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div></div>';
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
    if (params && params.contactId !== undefined) state.contactId = params.contactId;
    if (params && params.paymentClientId !== undefined) state.paymentClientId = params.paymentClientId;

    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('active', el.dataset.view === view);
    });
    document.querySelectorAll('.tab').forEach(function (el) {
      var nav = el.dataset.nav;
      var isActive = nav === view ||
        (nav === 'stream-list' && view === 'stream-detail') ||
        (nav === 'crm-list' && view === 'crm-detail') ||
        (nav === 'payments-list' && view === 'payments-detail');
      el.classList.toggle('active', isActive);
    });

    var titles = {
      dashboard: 'Челлендж', today: 'Сегодня', week: 'Неделя', month: 'Месяц',
      funnel: 'Воронка', 'crm-list': 'CRM', 'crm-detail': 'Контакт',
      'payments-list': 'Оплаты', 'payments-detail': 'Клиент',
      'stream-list': 'Эфиры', 'stream-detail': 'Эфир', settings: 'Настройки'
    };
    $('topbar-title').textContent = titles[view] || 'Челлендж';

    if (view === 'dashboard') renderDashboard();
    if (view === 'today') renderToday();
    if (view === 'week') renderWeek();
    if (view === 'month') renderMonth();
    if (view === 'funnel') { renderFunnelScreen(); if (FUNNEL_AUTO_ENABLED) fetchFunnel(); }
    if (view === 'crm-list') renderCrmList();
    if (view === 'crm-detail') renderCrmDetail();
    if (view === 'payments-list') renderPaymentsList();
    if (view === 'payments-detail') renderPaymentDetail();
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
    var daysSinceStart = Math.floor((parseDate(todayStr()) - parseDate(s.startDate)) / 86400000) + 1;

    $('dash-month-num').textContent = todayIdx;
    $('dash-day-num').textContent = Math.max(daysSinceStart, 1);
    $('dash-start-date').textContent = fmtHuman(parseDate(s.startDate));

    var todayMonthKey = monthKey(new Date());
    var monthIncome = sumPaymentsForMonth(todayMonthKey);
    var target = s.targetIncome || 0;
    var fillPct = target > 0 ? Math.min(100, Math.round((monthIncome / target) * 100)) : 0;

    $('dash-income-so-far').textContent = fmtMoney(monthIncome);
    $('dash-income-target').textContent = fmtMoney(target);
    $('dash-progress-fill').style.width = fillPct + '%';
    $('dash-progress-big').textContent = fillPct + '%';

    var note;
    if (target <= 0) {
      note = 'Задай целевой доход в Настройках';
    } else if (monthIncome >= target) {
      note = 'Цель месяца выполнена! Сверху: ' + fmtMoney(monthIncome - target);
    } else {
      note = 'До цели месяца не хватает ' + fmtMoney(target - monthIncome);
    }
    $('dash-progress-note').textContent = note;

    var day = data.days[todayStr()];
    var mini = $('dash-today-mini');
    mini.innerHTML = '';
    var items = [
      ['Комментариев сегодня', day ? day.commentsTotal : 0],
      ['Разборы сегодня', day ? day.calls : 0],
      ['Тест сегодня', day ? day.testSales : 0],
      ['Флагман сегодня', day ? day.flagshipSales : 0]
    ];
    items.forEach(function (it) {
      var div = document.createElement('div');
      div.className = 'mini-item';
      div.innerHTML = '<b>' + it[1] + '</b>' + it[0];
      mini.appendChild(div);
    });
  }

  function sumPaymentsForMonth(key) {
    var sum = 0;
    data.payments.forEach(function (c) {
      (c.payments || []).forEach(function (p) {
        if (p.date && p.date.indexOf(key) === 0) sum += (p.amount || 0);
      });
    });
    return sum;
  }

  // ================= ЭТАП 1: разовые задания по дням =================
  var STAGE1_TASKS = {
    1: {
      text: 'День 1: зафиксируй факт на старте — заявки, разборы и продажи за последний обычный месяц. И сделай первую запись в дневник — письмо себе через 6 месяцев: что мешало держать этот доход раньше?',
      field: true, fieldLabel: 'Факт на старте (заявки/разборы/продажи за последний обычный месяц)'
    },
    2: {
      text: 'День 2: сегодня — расчистка информационного пространства. Просто сделай это, вносить здесь ничего не нужно.',
      field: false
    },
    3: {
      text: 'День 3: собери список каналов конкурентов (добавь их в Настройках) и отметь топ-5.',
      field: true, fieldLabel: 'Топ-5 каналов конкурентов'
    },
    4: {
      text: 'День 4: зафиксируй контент-опоры (в Настройках) и распиши темы на неделю.',
      field: true, fieldLabel: 'Темы на неделю по контент-опорам'
    },
    5: {
      text: 'День 5: составь список кандидатов в партнёры для будущего эфира.',
      field: true, fieldLabel: 'Кандидаты в партнёры'
    },
    6: {
      text: 'День 6: сверься в воркботе по рассрочкам/займам. Здесь вносить ничего не нужно.',
      field: false
    },
    7: {
      text: 'День 7: обычное еженедельное ревью — переходи на экран «Неделя».',
      field: false, link: 'week', linkLabel: 'Перейти к неделе'
    },
    30: {
      text: 'День 30: обычный месячный разбор — экран «Месяц». Этап 2 планируется по факту месяца 1, детали появятся позже.',
      field: false, link: 'month', linkLabel: 'Перейти к месяцу'
    }
  };

  function renderStageTask() {
    var n = dayNumberFor(state.todayDate);
    var task = STAGE1_TASKS[n];
    var card = $('stage-task-card');
    var field = $('stage-task-field');
    var linkBtn = $('stage-task-link');
    if (!task) {
      card.hidden = true;
      field.hidden = true;
      field.value = '';
      linkBtn.hidden = true;
      return;
    }
    card.hidden = false;
    $('stage-task-text').textContent = task.text;
    if (task.field) {
      field.hidden = false;
      field.placeholder = task.fieldLabel;
      field.value = getDay(state.todayDate).stageNote || '';
    } else {
      field.hidden = true;
      field.value = '';
    }
    if (task.link) {
      linkBtn.hidden = false;
      linkBtn.textContent = task.linkLabel;
      linkBtn.onclick = function () { navigate(task.link); };
    } else {
      linkBtn.hidden = true;
    }
  }

  // ================= СЕГОДНЯ =================
  function renderPillarSelect() {
    var sel = $('f-pillar');
    sel.innerHTML = '';
    var optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '— не выбрано —';
    sel.appendChild(optNone);
    (data.settings.contentPillars || []).forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
  }

  function renderCommentChannelsList() {
    var wrap = $('f-comment-channels-list');
    var channels = data.settings.competitorChannels || [];
    var day = getDay(state.todayDate);
    wrap.innerHTML = '';
    if (!channels.length) {
      wrap.innerHTML = '<div class="diary-empty">Добавь каналы в Настройках, чтобы отмечать их здесь</div>';
      return;
    }
    channels.forEach(function (ch) {
      var label = document.createElement('label');
      label.className = 'row-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = day.commentedChannels.indexOf(ch) !== -1;
      cb.dataset.channel = ch;
      on(cb, 'change', saveTodayField);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + ch));
      wrap.appendChild(label);
    });
  }

  function renderToday() {
    $('today-date-input').value = state.todayDate;
    var day = getDay(state.todayDate);
    setCheck('f-reels', day.reels);
    setCheck('f-stories', day.stories);
    setCheck('f-tg-post', day.tgPost);
    setNum('f-threads', day.threads);
    renderPillarSelect();
    $('f-pillar').value = day.contentPillar || '';
    renderCommentChannelsList();
    setNum('f-comments-total', day.commentsTotal);
    setNum('f-base-contacts', day.baseContacts);
    setNum('f-calls', day.calls);
    setNum('f-test-sales', day.testSales);
    setNum('f-flagship-sales', day.flagshipSales);
    setText('f-diary', day.diary);
    renderDiaryHistory();
    renderStageTask();
  }

  function saveTodayField() {
    var day = getDay(state.todayDate);
    day.reels = checkVal('f-reels');
    day.stories = checkVal('f-stories');
    day.tgPost = checkVal('f-tg-post');
    day.threads = numVal('f-threads');
    day.contentPillar = $('f-pillar').value;
    var checked = [];
    document.querySelectorAll('#f-comment-channels-list [data-channel]').forEach(function (cb) {
      if (cb.checked) checked.push(cb.dataset.channel);
    });
    day.commentedChannels = checked;
    day.commentsTotal = numVal('f-comments-total');
    day.baseContacts = numVal('f-base-contacts');
    day.calls = numVal('f-calls');
    day.testSales = numVal('f-test-sales');
    day.flagshipSales = numVal('f-flagship-sales');
    day.diary = textVal('f-diary');
    var stageField = $('stage-task-field');
    if (!stageField.hidden) day.stageNote = stageField.value;
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

  ['f-reels', 'f-stories', 'f-tg-post', 'f-threads', 'f-pillar', 'f-comments-total',
    'f-base-contacts', 'f-calls', 'f-test-sales', 'f-flagship-sales'].forEach(function (id) {
    on($(id), 'change', function () { saveTodayField(); });
  });
  var diaryTimer = null;
  on($('f-diary'), 'input', function () {
    clearTimeout(diaryTimer);
    diaryTimer = setTimeout(saveTodayField, 400);
  });
  var stageFieldTimer = null;
  on($('stage-task-field'), 'input', function () {
    clearTimeout(stageFieldTimer);
    stageFieldTimer = setTimeout(saveTodayField, 400);
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
  function estimateWeeklyApplications(monday) {
    var history = data.funnelCache.history || [];
    if (!history.length) return null;
    var weekStart = monday.getTime();
    var weekEnd = addDays(monday, 7).getTime();
    var before = null, atEnd = null;
    history.forEach(function (h) {
      if (h.ts <= weekStart && (!before || h.ts > before.ts)) before = h;
      if (h.ts <= weekEnd && (!atEnd || h.ts > atEnd.ts)) atEnd = h;
    });
    if (!before || !atEnd || atEnd.ts <= before.ts) return null;
    var delta = (atEnd.applied || 0) - (before.applied || 0);
    return delta >= 0 ? delta : null;
  }

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
    var calls = 0, testSales = 0, flagshipSales = 0;
    for (var i = 0; i < 7; i++) {
      var k = fmtDate(addDays(monday, i));
      var d = data.days[k];
      if (d) {
        calls += d.calls || 0;
        testSales += d.testSales || 0;
        flagshipSales += d.flagshipSales || 0;
      }
    }
    var leadsEstimate = estimateWeeklyApplications(monday);
    var leadToCall = (leadsEstimate !== null && leadsEstimate > 0) ? calls / leadsEstimate : null;
    var callToTest = calls > 0 ? testSales / calls : null;
    var callToFlagship = calls > 0 ? flagshipSales / calls : null;

    var wrap = $('week-funnel');
    wrap.innerHTML =
      '<div class="funnel-step"><span>Заявки (оценка по воронке)</span><b>' + (leadsEstimate === null ? 'нет данных' : leadsEstimate) + '</b></div>' +
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

    renderMonthProgress();
  }

  function renderMonthProgress() {
    var s = data.settings;
    var rawIdx = challengeMonthIndexRaw(todayStr(), s.startDate);
    var monthsRemaining = Math.max(6 - rawIdx + 1, rawIdx > 6 ? 0 : 1);
    var key = monthKey(parseDate(state.monthDate));
    var monthIncome = sumPaymentsForMonth(key);
    var target = s.targetIncome || 0;
    var pctVal = target > 0 ? Math.round((monthIncome / target) * 100) : null;

    var grid = $('month-progress');
    grid.innerHTML =
      statItem('Доход за месяц (факт)', fmtMoney(monthIncome)) +
      statItem('Цель дохода в месяц', fmtMoney(target)) +
      statItem('% от цели', pctVal === null ? '—' : pctVal + '%') +
      statItem('Осталось месяцев (до 6-го)', Math.max(monthsRemaining, 0));
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

  // ================= ВОРОНКА =================
  var FUNNEL_STEPS = [
    ['opened', 'Открыл бота'],
    ['about', 'Обо мне'],
    ['lesson', 'Видеоурок'],
    ['quiz', 'Квиз'],
    ['form', 'Форма заявки'],
    ['applied', 'Заявка отправлена']
  ];

  function renderFunnelAutoStats() {
    var grid = $('funnel-auto-stats');
    var refreshBtn = $('funnel-refresh');
    if (!FUNNEL_AUTO_ENABLED) {
      grid.innerHTML = '<div class="diary-empty">Подключим позже — ждём доступ к Vercel</div>';
      $('funnel-updated').textContent = 'Автоматическая часть пока не подключена';
      refreshBtn.hidden = true;
      return;
    }
    refreshBtn.hidden = false;
    var cache = data.funnelCache;
    var f = cache.data && cache.data.funnel ? cache.data.funnel : null;
    grid.innerHTML = '';
    if (!f) {
      grid.innerHTML = '<div class="diary-empty">Данных пока нет</div>';
    } else {
      FUNNEL_STEPS.forEach(function (pair) {
        grid.insertAdjacentHTML('beforeend', statItem(pair[1], f[pair[0]] !== undefined ? f[pair[0]] : '—'));
      });
      var convPct = (cache.data.conversionPercent !== undefined && cache.data.conversionPercent !== null)
        ? (round1(cache.data.conversionPercent) + '%') : '—';
      grid.insertAdjacentHTML('beforeend', statItem('Конверсия в заявку', convPct));
    }
    var note;
    if (cache.lastSuccess) {
      var d = new Date(cache.lastSuccess);
      note = 'Обновлено: ' + fmtHuman(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      if (cache.lastError) note += ' · последнее обновление не удалось, показаны данные из кеша';
    } else {
      note = cache.lastError ? 'Не удалось загрузить данные воронки' : 'Ещё не обновлялось';
    }
    $('funnel-updated').textContent = note;
  }

  function renderFunnelPartners() {
    var wrap = $('funnel-partners');
    if (!FUNNEL_AUTO_ENABLED) {
      wrap.innerHTML = '<div class="diary-empty">Появится вместе с автоматической частью воронки</div>';
      return;
    }
    var cache = data.funnelCache;
    var partners = (cache.data && cache.data.partners) || [];
    if (!partners.length) {
      wrap.innerHTML = '<div class="diary-empty">Нет данных по партнёрам</div>';
      return;
    }
    wrap.innerHTML = '';
    partners.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'partners-row';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = p.name || '—';
      var metaSpan = document.createElement('span');
      metaSpan.className = 'partners-meta';
      metaSpan.textContent = (p.clicks || 0) + ' переходов · ' + (p.applications || 0) + ' заявок';
      row.appendChild(nameSpan);
      row.appendChild(metaSpan);
      wrap.appendChild(row);
    });
  }

  function renderFunnelChain() {
    var calls = 0, testSales = 0, flagshipSales = 0;
    Object.keys(data.days).forEach(function (k) {
      calls += data.days[k].calls || 0;
      testSales += data.days[k].testSales || 0;
      flagshipSales += data.days[k].flagshipSales || 0;
    });
    var callToTest = calls > 0 ? testSales / calls : null;
    var callToFlagship = calls > 0 ? flagshipSales / calls : null;

    var stepsHtml = '';
    if (FUNNEL_AUTO_ENABLED) {
      var cache = data.funnelCache;
      var f = (cache.data && cache.data.funnel) || {};
      var applied = f.applied || 0;
      var appliedToCall = applied > 0 ? calls / applied : null;
      stepsHtml += FUNNEL_STEPS.map(function (pair) {
        return '<div class="funnel-step"><span>' + pair[1] + '</span><b>' + (f[pair[0]] !== undefined ? f[pair[0]] : '—') + '</b></div>';
      }).join('');
      stepsHtml += '<div class="funnel-step"><span>→ Разборы (всего)</span><b>' + calls + ' (' + pct(appliedToCall) + ')</b></div>';
    } else {
      stepsHtml += '<div class="funnel-step"><span>Бот → Заявка</span><b>подключим позже</b></div>';
      stepsHtml += '<div class="funnel-step"><span>→ Разборы (всего)</span><b>' + calls + '</b></div>';
    }
    stepsHtml +=
      '<div class="funnel-step"><span>→ Тест-драйв (всего)</span><b>' + testSales + ' (' + pct(callToTest) + ')</b></div>' +
      '<div class="funnel-step"><span>→ Флагман (всего)</span><b>' + flagshipSales + ' (' + pct(callToFlagship) + ')</b></div>';
    $('funnel-chain').innerHTML = stepsHtml;
  }

  function renderFunnelScreen() {
    renderFunnelAutoStats();
    renderFunnelPartners();
    renderFunnelChain();
  }

  function fetchFunnel() {
    return fetch(FUNNEL_API).then(function (res) {
      if (!res.ok) throw new Error('bad status ' + res.status);
      return res.json();
    }).then(function (json) {
      data.funnelCache.data = json;
      data.funnelCache.lastSuccess = Date.now();
      data.funnelCache.lastError = false;
      var f = json.funnel || {};
      var history = data.funnelCache.history || [];
      history.push({ ts: Date.now(), opened: f.opened || 0, about: f.about || 0, lesson: f.lesson || 0, quiz: f.quiz || 0, form: f.form || 0, applied: f.applied || 0 });
      if (history.length > 400) history = history.slice(history.length - 400);
      data.funnelCache.history = history;
      saveData();
      if (state.view === 'funnel') renderFunnelScreen();
      renderDashboard();
    }).catch(function () {
      data.funnelCache.lastError = true;
      saveData();
      if (state.view === 'funnel') renderFunnelAutoStats();
    });
  }

  on($('funnel-refresh'), 'click', function () {
    $('funnel-updated').textContent = 'Обновляю...';
    fetchFunnel();
  });

  // ================= ОПЛАТЫ =================
  var PRODUCT_LABELS = { intensive: 'Интенсив', flagship: 'Флагман', custom: 'Свой вариант' };

  function newPaymentClient() {
    var c = {
      id: 'pay_' + Date.now(),
      name: '',
      product: 'intensive',
      totalAmount: data.settings.testPrice || 0,
      payments: [],
      createdAt: Date.now()
    };
    data.payments.push(c);
    saveData();
    return c;
  }

  function currentPaymentClient() {
    return data.payments.find(function (c) { return c.id === state.paymentClientId; });
  }

  function paidSum(client) {
    return (client.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0);
  }

  function renderPaymentsList() {
    var wrap = $('payments-client-list');
    var list = data.payments.slice();
    list.sort(function (a, b) {
      var aDone = a.totalAmount > 0 && paidSum(a) >= a.totalAmount;
      var bDone = b.totalAmount > 0 && paidSum(b) >= b.totalAmount;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
    if (!list.length) {
      wrap.innerHTML = '<div class="stream-empty">Клиентов пока нет. Нажми «Новый клиент».</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach(function (c) {
      var paid = paidSum(c);
      var total = c.totalAmount || 0;
      var pctVal = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
      var done = total > 0 && paid >= total;

      var card = document.createElement('div');
      card.className = 'stream-card';

      var title = document.createElement('div');
      title.className = 'stream-card-title';
      title.textContent = c.name || 'Без имени';

      var meta = document.createElement('div');
      meta.className = 'stream-card-meta';
      meta.textContent = PRODUCT_LABELS[c.product] || c.product;

      var barWrap = document.createElement('div');
      barWrap.className = 'progress-bar';
      barWrap.style.margin = '10px 0 6px';
      var barFill = document.createElement('div');
      barFill.className = 'progress-bar-fill';
      barFill.style.width = pctVal + '%';
      barWrap.appendChild(barFill);

      var numbers = document.createElement('div');
      numbers.className = 'small muted';
      numbers.textContent = fmtMoney(paid) + ' / ' + fmtMoney(total) + ' — ' + pctVal + '%';

      var badge = document.createElement('div');
      badge.className = 'stage-badge';
      badge.textContent = done ? 'Оплачено полностью' : 'В рассрочке';

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(barWrap);
      card.appendChild(numbers);
      card.appendChild(badge);
      card.addEventListener('click', function () { navigate('payments-detail', { paymentClientId: c.id }); });
      wrap.appendChild(card);
    });
  }

  on($('payment-client-new'), 'click', function () {
    var c = newPaymentClient();
    navigate('payments-detail', { paymentClientId: c.id });
  });
  on($('payment-back'), 'click', function () { navigate('payments-list'); });

  function renderPaymentPaymentsList(c) {
    var wrap = $('pay-payments-list');
    if (!c.payments.length) {
      wrap.innerHTML = '<div class="diary-empty">Платежей пока нет</div>';
      return;
    }
    wrap.innerHTML = '';
    c.payments.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'ad-item';
      var span = document.createElement('span');
      span.textContent = fmtMoney(p.amount) + ' · ' + fmtHuman(parseDate(p.date));
      var del = document.createElement('button');
      del.className = 'ad-item-del';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        c.payments = c.payments.filter(function (x) { return x.id !== p.id; });
        saveData();
        renderPaymentPaymentsList(c);
        renderPaymentProgress(c);
        renderDashboard();
      });
      row.appendChild(span);
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function renderPaymentProgress(c) {
    var paid = paidSum(c);
    var total = c.totalAmount || 0;
    var pctVal = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    $('pay-progress-numbers').textContent = fmtMoney(paid) + ' / ' + fmtMoney(total) + ' — ' + pctVal + '%';
    $('pay-progress-fill').style.width = pctVal + '%';
    var done = total > 0 && paid >= total;
    $('pay-status-badge').textContent = done ? 'Оплачено полностью' : 'В рассрочке';
  }

  function renderPaymentDetail() {
    var c = currentPaymentClient();
    if (!c) { navigate('payments-list'); return; }
    setText('pay-client-name', c.name);
    $('pay-client-product').value = c.product;
    setNum('pay-client-total', c.totalAmount);
    $('pay-new-date').value = todayStr();
    renderPaymentPaymentsList(c);
    renderPaymentProgress(c);
  }

  function savePaymentClientField() {
    var c = currentPaymentClient();
    if (!c) return;
    c.name = textVal('pay-client-name');
    c.product = $('pay-client-product').value;
    c.totalAmount = numVal('pay-client-total');
    saveData();
    renderPaymentProgress(c);
  }

  on($('pay-client-name'), 'change', savePaymentClientField);
  on($('pay-client-total'), 'change', savePaymentClientField);
  on($('pay-client-product'), 'change', function () {
    var c = currentPaymentClient();
    if (!c) return;
    var product = $('pay-client-product').value;
    c.product = product;
    if (product === 'intensive') c.totalAmount = data.settings.testPrice || 0;
    else if (product === 'flagship') c.totalAmount = data.settings.flagshipPrice || 0;
    // 'custom': сумма остаётся такой, какая была введена вручную
    setNum('pay-client-total', c.totalAmount);
    saveData();
    renderPaymentProgress(c);
  });

  on($('pay-add-payment'), 'click', function () {
    var c = currentPaymentClient();
    if (!c) return;
    var amount = parseFloat($('pay-new-amount').value);
    var dateStr = $('pay-new-date').value || todayStr();
    if (!amount || amount <= 0) { alert('Укажи сумму платежа'); return; }
    c.payments.push({
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      amount: amount,
      date: dateStr
    });
    saveData();
    $('pay-new-amount').value = '';
    renderPaymentPaymentsList(c);
    renderPaymentProgress(c);
    renderDashboard();
  });

  on($('payment-save'), 'click', function () {
    savePaymentClientField();
    flashStatus('payment-save-status', 'Сохранено ✓');
    renderPaymentsList();
  });
  on($('payment-delete'), 'click', function () {
    var c = currentPaymentClient();
    if (!c) return;
    if (!confirm('Удалить клиента «' + (c.name || 'без имени') + '» вместе со всеми платежами?')) return;
    data.payments = data.payments.filter(function (x) { return x.id !== c.id; });
    saveData();
    navigate('payments-list');
  });

  // ================= CRM =================
  var CRM_STAGES = ['старый', 'новый', 'переписка', 'назначен созвон', 'созвон проведён', 'внёс оплату'];

  function newContact() {
    var c = {
      id: 'contact_' + Date.now(),
      name: '', source: '', stage: CRM_STAGES[1], note: '',
      lastTouch: todayStr(), createdAt: Date.now()
    };
    data.contacts.push(c);
    saveData();
    return c;
  }

  function currentContact() {
    return data.contacts.find(function (c) { return c.id === state.contactId; });
  }

  function renderCrmList() {
    var wrap = $('crm-list');
    var list = data.contacts.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (!list.length) {
      wrap.innerHTML = '<div class="stream-empty">Контактов пока нет. Нажми «Новый контакт».</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'stream-card';
      var title = document.createElement('div');
      title.className = 'stream-card-title';
      title.textContent = c.name || 'Без имени';
      var meta = document.createElement('div');
      meta.className = 'stream-card-meta';
      meta.textContent = (c.source ? c.source + ' · ' : '') + 'касание: ' + (c.lastTouch ? fmtHuman(parseDate(c.lastTouch)) : '—');
      var badge = document.createElement('div');
      badge.className = 'stage-badge';
      badge.textContent = c.stage;
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(badge);
      card.addEventListener('click', function () { navigate('crm-detail', { contactId: c.id }); });
      wrap.appendChild(card);
    });
  }

  on($('crm-new'), 'click', function () {
    var c = newContact();
    navigate('crm-detail', { contactId: c.id });
  });
  on($('crm-back'), 'click', function () { navigate('crm-list'); });

  function renderCrmStagePicker(selected) {
    var wrap = $('crm-stage-picker');
    wrap.innerHTML = '';
    CRM_STAGES.forEach(function (stage) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'stage-chip' + (stage === selected ? ' active' : '');
      chip.textContent = stage;
      chip.addEventListener('click', function () {
        var c = currentContact();
        if (!c) return;
        c.stage = stage;
        saveData();
        renderCrmStagePicker(stage);
      });
      wrap.appendChild(chip);
    });
  }

  function renderCrmDetail() {
    var c = currentContact();
    if (!c) { navigate('crm-list'); return; }
    setText('crm-name', c.name);
    setText('crm-source', c.source);
    $('crm-last-touch').value = c.lastTouch || '';
    setText('crm-note', c.note);
    renderCrmStagePicker(c.stage);
  }

  function saveCrmField() {
    var c = currentContact();
    if (!c) return;
    c.name = textVal('crm-name');
    c.source = textVal('crm-source');
    c.lastTouch = $('crm-last-touch').value;
    c.note = textVal('crm-note');
    saveData();
  }

  on($('crm-name'), 'change', saveCrmField);
  on($('crm-source'), 'change', saveCrmField);
  on($('crm-last-touch'), 'change', saveCrmField);
  var crmNoteTimer = null;
  on($('crm-note'), 'input', function () {
    clearTimeout(crmNoteTimer);
    crmNoteTimer = setTimeout(saveCrmField, 400);
  });
  on($('crm-save'), 'click', function () {
    saveCrmField();
    flashStatus('crm-save-status', 'Сохранено ✓');
    renderCrmList();
  });
  on($('crm-delete'), 'click', function () {
    var c = currentContact();
    if (!c) return;
    if (!confirm('Удалить контакт «' + (c.name || 'без имени') + '»?')) return;
    data.contacts = data.contacts.filter(function (x) { return x.id !== c.id; });
    saveData();
    navigate('crm-list');
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
  function renderTagList(containerId, items, onRemove) {
    var wrap = $(containerId);
    wrap.innerHTML = '';
    items.forEach(function (item, idx) {
      var chip = document.createElement('div');
      chip.className = 'tag-chip';
      var span = document.createElement('span');
      span.textContent = item;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '✕';
      btn.addEventListener('click', function () { onRemove(idx); });
      chip.appendChild(span);
      chip.appendChild(btn);
      wrap.appendChild(chip);
    });
  }

  function renderSettingsLists() {
    renderTagList('pillars-list', data.settings.contentPillars, function (idx) {
      data.settings.contentPillars.splice(idx, 1);
      saveData();
      renderSettingsLists();
    });
    renderTagList('channels-list', data.settings.competitorChannels, function (idx) {
      data.settings.competitorChannels.splice(idx, 1);
      saveData();
      renderSettingsLists();
    });
  }

  on($('pillar-add'), 'click', function () {
    var v = $('pillar-input').value.trim();
    if (!v) return;
    data.settings.contentPillars.push(v);
    $('pillar-input').value = '';
    saveData();
    renderSettingsLists();
  });
  on($('channel-add'), 'click', function () {
    var v = $('channel-input').value.trim();
    if (!v) return;
    data.settings.competitorChannels.push(v);
    $('channel-input').value = '';
    saveData();
    renderSettingsLists();
  });

  function renderSettings() {
    var s = data.settings;
    setNum('s-target-income', s.targetIncome);
    setNum('s-flagship-price', s.flagshipPrice);
    setNum('s-test-price', s.testPrice);
    setNum('s-max-clients-min', s.maxClientsMin);
    setNum('s-max-clients-max', s.maxClientsMax);
    $('s-start-date').value = s.startDate;
    renderSettingsLists();
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
        data.contacts = parsed.contacts || [];
        data.payments = parsed.payments || [];
        data.funnelCache = Object.assign(defaultData().funnelCache, parsed.funnelCache || {});
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
    if (!confirm('Последнее предупреждение: все дни, недели, месяцы, эфиры и контакты будут стёрты. Продолжить?')) return;
    localStorage.removeItem(STORAGE_KEY);
    data = defaultData();
    navigate('dashboard');
  });

  // ================= INIT =================
  navigate('dashboard');
  if (FUNNEL_AUTO_ENABLED) fetchFunnel();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service worker не зарегистрирован (это нормально при открытии файла напрямую):', err);
      });
    });
  }
})();

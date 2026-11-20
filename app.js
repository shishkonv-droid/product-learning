(() => {
  "use strict";
  const C = window.COURSE;
  const STORE_KEY = "pm-course-v1";
  const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  // ---------- state ----------
  const state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      return { done: s.done || {}, notes: s.notes || {}, checks: s.checks || {} };
    } catch (e) {
      return { done: {}, notes: {}, checks: {} };
    }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  // ---------- data helpers ----------
  const lessons = [];
  C.weeks.forEach((w) => {
    const [y, m, d] = w.start.split("-").map(Number);
    w.lessons.forEach((l, i) => {
      l.week = w;
      l.date = new Date(y, m - 1, d + i);
      lessons.push(l);
    });
  });
  const byN = Object.fromEntries(lessons.map((l) => [l.n, l]));
  const TOTAL = lessons.length;

  const dayKey = (dt) => dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
  const fmtDate = (dt) => `${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
  const doneCount = () => lessons.filter((l) => state.done[l.n]).length;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function todayLesson() {
    const k = dayKey(new Date());
    return lessons.find((l) => dayKey(l.date) === k) || null;
  }
  function nextScheduled() {
    const k = dayKey(new Date());
    return lessons.find((l) => dayKey(l.date) > k) || null;
  }
  function firstUndone() { return lessons.find((l) => !state.done[l.n]) || null; }
  function currentWeek() {
    const k = dayKey(new Date());
    let cur = C.weeks[0];
    C.weeks.forEach((w) => { if (dayKey(w.lessons[0].date) <= k) cur = w; });
    return cur;
  }
  function lessonTitle(l) {
    const full = C.fullLessons[l.n];
    if (full) return full.title.split(" · ").slice(2).join(" · ");
    return l.theme;
  }

  // ---------- ui ----------
  const view = document.getElementById("view");
  const titleEl = document.getElementById("title");
  const backBtn = document.getElementById("back");
  const ring = document.getElementById("ring");
  const ringText = document.getElementById("ringText");

  function updateRing() {
    const p = Math.round((doneCount() / TOTAL) * 100);
    ring.style.setProperty("--p", p);
    ringText.textContent = p + "%";
  }

  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
  }

  function lessonRow(l, highlight) {
    const done = state.done[l.n];
    const hasFull = C.fullLessons[l.n] ? '<span class="badge">полный урок</span>' : "";
    const note = state.notes[l.n] ? ' · <span title="Есть запись">✎</span>' : "";
    return `<a class="lesson ${done ? "is-done" : ""} ${highlight ? "today" : ""}" href="#/lesson/${l.n}">
      <button class="chk" data-toggle="${l.n}" aria-label="Отметить урок ${l.n}">✓</button>
      <div class="lbody"><div class="ltitle">${l.n}. ${esc(lessonTitle(l))}${hasFull}</div>
      <div class="lmeta">${fmtDate(l.date)}${note}</div></div></a>`;
  }

  function heroCard(l, label) {
    const w = l.week;
    return `<div class="card hero">
      <div class="eyebrow">${label}</div>
      <h2>${esc(lessonTitle(l))}</h2>
      <div class="muted">Урок ${l.n} из ${TOTAL} · ${fmtDate(l.date)}, 19:00 · Неделя ${w.n}: ${esc(w.title)}</div>
      <p><b>Практика:</b> ${esc(l.practice)}</p>
      <div class="btn-row"><a class="btn" href="#/lesson/${l.n}">Открыть урок</a></div>
    </div>`;
  }

  // ---------- views ----------
  function renderToday() {
    const tl = todayLesson();
    const next = nextScheduled();
    const undone = firstUndone();
    const w = currentWeek();
    const dc = doneCount();
    const wDone = w.lessons.filter((l) => state.done[l.n]).length;
    let html = "";

    if (tl) {
      html += heroCard(tl, state.done[tl.n] ? "Сегодня · пройдено ✓" : "Урок на сегодня");
    } else if (!undone) {
      html += `<div class="card hero"><div class="eyebrow">Готово</div><h2>Все 120 уроков пройдены 🎉</h2><p>Загляни в чек-лист грейда в «Материалах».</p></div>`;
    } else if (next) {
      const restNote = C.notes.find((n) => {
        const w5 = C.weeks.find((x) => x.n === n.afterWeek);
        const after = C.weeks.find((x) => x.n === n.afterWeek + 1);
        const k = dayKey(new Date());
        return w5 && after && k > dayKey(w5.lessons[4].date) && k < dayKey(after.lessons[0].date);
      });
      html += `<div class="card"><div class="eyebrow">Сегодня занятий нет</div>
        <p>${restNote ? esc(restNote.text) : "Выходной. Можно догнать пропущенное или отдохнуть."}</p></div>`;
      html += heroCard(next, "Следующий урок");
    }

    if (undone && (!tl || undone.n < tl.n) && (!next || tl || undone.n < next.n)) {
      html += `<div class="section-title">Догнать</div><div class="card" style="padding:0;overflow:hidden">${lessonRow(undone)}</div>`;
    }

    html += `<div class="section-title">Прогресс</div>
      <div class="stats">
        <div class="stat"><b>${dc}</b><span>из ${TOTAL} уроков</span></div>
        <div class="stat"><b>${C.weeks.filter((x) => x.lessons.every((l) => state.done[l.n])).length}</b><span>из 24 недель</span></div>
        <div class="stat"><b>${Object.values(state.notes).filter((s) => s && s.trim()).length}</b><span>записей в журнале</span></div>
      </div>`;

    html += `<div class="section-title">Неделя ${w.n} · ${esc(w.dates)}</div>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:14px 16px"><b>${esc(w.title)}</b>
        <div class="progress"><i style="width:${(wDone / 5) * 100}%"></i></div>
        <div class="muted">${wDone} из 5</div></div>
        ${w.lessons.map((l) => lessonRow(l, tl && tl.n === l.n)).join("")}
      </div>`;

    html += installTip();
    view.innerHTML = html;
  }

  function installTip() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone) return "";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="card install-tip"><div class="eyebrow">Установить на телефон</div>
      ${ios ? "В Safari нажми «Поделиться» → «На экран „Домой“»." : "В меню браузера выбери «Установить приложение» или «Добавить на главный экран»."}
      После установки приложение работает и без интернета.</div>`;
  }

  function renderProgram() {
    const cw = currentWeek();
    const tl = todayLesson();
    let html = "";
    C.blocks.forEach((b) => {
      html += `<div class="block-head"><h2>${esc(b.title)}</h2><div class="muted">${esc(b.desc)}</div></div>`;
      C.weeks.filter((w) => w.block === b.n).forEach((w) => {
        const d = w.lessons.filter((l) => state.done[l.n]).length;
        const cls = d === 5 ? "complete" : w === cw ? "current" : "";
        html += `<details class="week" id="week-${w.n}" ${w === cw ? "open" : ""}>
          <summary><div class="wk-num ${cls}">${d === 5 ? "✓" : w.n}</div>
          <div class="wk-main"><b>${esc(w.title)}</b><span class="muted">Неделя ${w.n} · ${esc(w.dates)}</span></div>
          <div class="wk-count">${d}/5</div></summary>
          ${w.lessons.map((l) => lessonRow(l, tl && tl.n === l.n)).join("")}
        </details>`;
        C.notes.filter((n) => n.afterWeek === w.n).forEach((n) => { html += `<div class="note-break">🎄 ${esc(n.text)}</div>`; });
      });
    });
    view.innerHTML = html;
  }

  function renderLesson(n) {
    const l = byN[n];
    if (!l) return go("#/program");
    const w = l.week;
    const full = C.fullLessons[l.n];
    const done = state.done[l.n];
    const prev = byN[l.n - 1], next = byN[l.n + 1];
    let html = `<div class="card">
      <div class="eyebrow">Урок ${l.n} из ${TOTAL} · Неделя ${w.n}</div>
      <h2>${esc(lessonTitle(l))}</h2>
      <div class="muted">${fmtDate(l.date)}, 19:00 · ${esc(w.title)}</div>
      ${full ? "" : `<p><b>Тема и теория:</b> ${esc(l.theme)}</p>`}
      <p><b>Практика:</b> ${esc(l.practice)}</p>
      <div class="btn-row"><button class="btn ${done ? "done" : ""}" data-toggle="${l.n}">${done ? "✓ Пройдено" : "Отметить пройденным"}</button></div>
    </div>`;

    if (full) {
      html += `<div class="card content">${full.html}</div>`;
    } else {
      html += `<div class="card content">
        <div class="eyebrow">Формат занятия · 60 минут</div>
        <ol>
          <li><b>15 мин — теория:</b> статья, глава или видео по теме (см. «Ресурсы» в «Материалах»).</li>
          <li><b>30 мин — практика:</b> ${esc(l.practice)}.</li>
          <li><b>10 мин — AI-приём:</b> сделай то же задание с ИИ и сравни со своей версией.</li>
          <li><b>5 мин — журнал:</b> что понял(а) и что применю завтра.</li>
        </ol></div>`;
    }

    html += `<div class="card"><div class="eyebrow">Журнал продакта</div>
      <p class="muted">Что поняла и что применю завтра.</p>
      <textarea id="note" placeholder="Запись к уроку ${l.n}…">${esc(state.notes[l.n] || "")}</textarea>
      <div class="saved" id="saved"></div></div>`;

    html += `<div class="btn-row" style="justify-content:space-between">
      ${prev ? `<a class="btn secondary" href="#/lesson/${prev.n}">‹ Урок ${prev.n}</a>` : "<span></span>"}
      ${next ? `<a class="btn secondary" href="#/lesson/${next.n}">Урок ${next.n} ›</a>` : ""}
    </div>`;
    view.innerHTML = html;
    addCopyButtons();

    const ta = document.getElementById("note");
    const saved = document.getElementById("saved");
    let t;
    ta.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.notes[l.n] = ta.value; save();
        saved.textContent = "Сохранено";
        setTimeout(() => (saved.textContent = ""), 1200);
      }, 400);
    });
  }

  function addCopyButtons() {
    view.querySelectorAll(".content blockquote").forEach((bq) => {
      const b = document.createElement("button");
      b.className = "copy-btn"; b.textContent = "Скопировать промпт";
      b.addEventListener("click", async () => {
        const txt = bq.innerText.replace(/^«|»$/g, "").trim();
        try { await navigator.clipboard.writeText(txt); toast("Промпт скопирован"); }
        catch (e) { toast("Не удалось скопировать"); }
      });
      bq.appendChild(b);
    });
  }

  function renderMaterials() {
    view.innerHTML = C.pages.map((p, i) => `<a class="list-link" href="#/page/${i}">${esc(p.title)}</a>`).join("") +
      `<a class="list-link" href="https://claude.ai/artifact/FE2zorBVc4RKNgsbihXgQ9" target="_blank" rel="noopener">Исходный документ программы</a>`;
  }

  function renderPage(i) {
    const p = C.pages[i];
    if (!p) return go("#/materials");
    view.innerHTML = `<div class="card content"><h2>${esc(p.title)}</h2>${p.html}</div>`;
    view.querySelectorAll("input[data-check]").forEach((cb) => {
      cb.checked = !!state.checks[cb.dataset.check];
      cb.addEventListener("change", () => { state.checks[cb.dataset.check] = cb.checked; save(); });
    });
  }

  function renderJournal() {
    const entries = lessons.filter((l) => state.notes[l.n] && state.notes[l.n].trim());
    let html = `<div class="card"><div class="eyebrow">Журнал продакта</div>
      <p class="muted">Записи к урокам. Всё хранится только на этом устройстве — сохраняй резервную копию.</p>
      <div class="btn-row">
        <button class="btn secondary" id="export">Скачать копию</button>
        <label class="btn secondary">Восстановить<input type="file" id="import" accept="application/json" hidden></label>
      </div></div>`;
    if (!entries.length) {
      html += `<div class="card muted">Пока пусто. Записи появятся здесь, когда ты заполнишь поле «Журнал продакта» в уроке.</div>`;
    } else {
      html += `<div class="card">${entries.slice().reverse().map((l) => `<div class="journal-entry">
        <a href="#/lesson/${l.n}"><b>Урок ${l.n}. ${esc(lessonTitle(l))}</b></a>
        <div class="muted">${fmtDate(l.date)}</div><p>${esc(state.notes[l.n])}</p></div>`).join("")}</div>`;
    }
    html += `<div class="btn-row"><button class="btn secondary" id="reset">Сбросить весь прогресс</button></div>`;
    view.innerHTML = html;

    document.getElementById("export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `product-course-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    document.getElementById("import").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        state.done = d.done || {}; state.notes = d.notes || {}; state.checks = d.checks || {};
        save(); updateRing(); renderJournal(); toast("Прогресс восстановлен");
      } catch (err) { toast("Файл не подошёл"); }
    });
    document.getElementById("reset").addEventListener("click", () => {
      if (!confirm("Удалить все отметки, записи журнала и чек-лист?")) return;
      state.done = {}; state.notes = {}; state.checks = {};
      save(); updateRing(); renderJournal();
    });
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    const n = t.dataset.toggle;
    if (state.done[n]) delete state.done[n]; else state.done[n] = new Date().toISOString();
    save(); updateRing();
    if (state.done[n]) toast(`Урок ${n} пройден`);
    const openWeeks = [...view.querySelectorAll("details[open]")].map((d) => d.id);
    const y = window.scrollY;
    route();
    openWeeks.forEach((id) => { const d = document.getElementById(id); if (d) d.open = true; });
    window.scrollTo(0, y);
  });
  backBtn.addEventListener("click", () => (history.length > 1 ? history.back() : go("#/today")));

  // ---------- router ----------
  function go(h) { location.hash = h; }
  let lastHash = "";
  function route() {
    const h = location.hash || "#/today";
    const [, name, arg] = h.split("/");
    const tab = { today: "today", program: "program", lesson: "program", materials: "materials", page: "materials", journal: "journal" }[name] || "today";
    document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    const sub = name === "lesson" || name === "page";
    backBtn.hidden = !sub;
    titleEl.textContent = {
      today: "Сегодня", program: "Программа", materials: "Материалы", journal: "Журнал",
      lesson: `Урок ${arg}`, page: (C.pages[arg] || {}).title || "Материалы",
    }[name] || "Сегодня";
    if (name === "program") renderProgram();
    else if (name === "lesson") renderLesson(Number(arg));
    else if (name === "materials") renderMaterials();
    else if (name === "page") renderPage(Number(arg));
    else if (name === "journal") renderJournal();
    else renderToday();
    updateRing();
    if (h !== lastHash) {
      window.scrollTo(0, 0);
      if (name === "program") { const o = view.querySelector("details[open]"); if (o) o.scrollIntoView({ block: "start" }); }
    }
    lastHash = h;
  }
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();

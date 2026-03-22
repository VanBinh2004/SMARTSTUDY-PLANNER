(() => {
  "use strict";

  /** @returns {HTMLElement} */
  const qs = (sel, root = document) => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`Missing element: ${sel}`);
    return el;
  };

  /** @returns {HTMLElement|null} */
  const qso = (sel, root = document) => root.querySelector(sel);

  const STORAGE_KEY = "dl_deadline_schedule_v1";

  const DAY_NAMES = [
    { key: 1, short: "T2", long: "Thứ 2" },
    { key: 2, short: "T3", long: "Thứ 3" },
    { key: 3, short: "T4", long: "Thứ 4" },
    { key: 4, short: "T5", long: "Thứ 5" },
    { key: 5, short: "T6", long: "Thứ 6" },
    { key: 6, short: "T7", long: "Thứ 7" },
    { key: 0, short: "CN", long: "Chủ nhật" },
  ];

  const byDayKey = (k) => DAY_NAMES.find((d) => d.key === k) || DAY_NAMES[0];

  const pad2 = (n) => String(n).padStart(2, "0");

  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const safeText = (s) => (s ?? "").toString().trim();

  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  // Parse "YYYY-MM-DDTHH:mm" from <input type="datetime-local"> as local time reliably.
  const parseLocalDateTime = (s) => {
    const str = safeText(s);
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str);
    if (!m) return null;
    const [_, y, mo, da, h, mi] = m;
    return new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), 0, 0);
  };

  const formatDateTimeVI = (d) => {
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  };

  const formatDateVI = (d) => {
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatTime = (hhmm) => {
    const str = safeText(hhmm);
    if (!/^\d{2}:\d{2}$/.test(str)) return str;
    return str;
  };

  const downloadText = (filename, text) => {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toast = (msg) => {
    // lightweight, no-CSS dependency: use alert fallback
    // We keep it minimal to avoid editing CSS/HTML.
    window.setTimeout(() => {
      try {
        // eslint-disable-next-line no-alert
        alert(msg);
      } catch {
        /* ignore */
      }
    }, 0);
  };

  /** @typedef {{id:string, kind:"deadline", title:string, course:string, dueLocal:string, priority:"low"|"medium"|"high", color:string, notes:string, createdAt:number, done:boolean, doneAt:number|null}} Deadline */
  /** @typedef {{id:string, kind:"class", title:string, course:string, day:number, color:string, start:string, end:string, location:string, teacher:string, notes:string, createdAt:number}} ClassItem */
  /** @typedef {{deadlines: Deadline[], classes: ClassItem[]}} AppState */

  /** @returns {AppState} */
  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { deadlines: [], classes: [] };
      const obj = JSON.parse(raw);
      const deadlines = Array.isArray(obj?.deadlines) ? obj.deadlines : [];
      const classes = Array.isArray(obj?.classes) ? obj.classes : [];
      return {
        deadlines: deadlines
          .filter(Boolean)
          .map((d) => ({
            id: String(d.id || uid()),
            kind: "deadline",
            title: safeText(d.title),
            course: safeText(d.course),
            dueLocal: safeText(d.dueLocal),
            priority: d.priority === "high" || d.priority === "low" ? d.priority : "medium",
            color: safeText(d.color) || "#ffcc66",
            notes: safeText(d.notes),
            createdAt: Number(d.createdAt || Date.now()),
            done: Boolean(d.done),
            doneAt: d.doneAt == null ? null : Number(d.doneAt),
          })),
        classes: classes
          .filter(Boolean)
          .map((c) => ({
            id: String(c.id || uid()),
            kind: "class",
            title: safeText(c.title),
            course: safeText(c.course),
            day: clamp(Number(c.day), 0, 6),
            color: safeText(c.color) || "#6d5efc",
            start: safeText(c.start),
            end: safeText(c.end),
            location: safeText(c.location),
            teacher: safeText(c.teacher),
            notes: safeText(c.notes),
            createdAt: Number(c.createdAt || Date.now()),
          })),
      };
    } catch {
      return { deadlines: [], classes: [] };
    }
  };

  /** @param {AppState} state */
  const saveState = (state) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  let state = loadState();

  // Elements
  const elSidebar = qs(".sidebar");
  const elToggleSidebarBtn = qs("#toggleSidebarBtn");

  const elViewTitle = qs("#viewTitle");
  const elViewSubtitle = qs("#viewSubtitle");
  const elNavItems = Array.from(document.querySelectorAll(".nav__item"));
  const elViews = Array.from(document.querySelectorAll(".view"));

  const elQuickAddDeadlineBtn = qs("#quickAddDeadlineBtn");
  const elQuickAddClassBtn = qs("#quickAddClassBtn");
  const elExportBtn = qs("#exportBtn");
  const elResetBtn = qs("#resetBtn");

  // Dashboard
  const elKpiUpcoming = qs("#kpiUpcoming");
  const elKpiUpcomingMeta = qs("#kpiUpcomingMeta");
  const elKpiToday = qs("#kpiToday");
  const elKpiTodayMeta = qs("#kpiTodayMeta");
  const elKpiDone = qs("#kpiDone");
  const elKpiDoneMeta = qs("#kpiDoneMeta");
  const elDashDeadlinesList = qs("#dashDeadlinesList");
  const elDashTodayClassesList = qs("#dashTodayClassesList");
  const elGoDeadlinesBtn = qs("#goDeadlinesBtn");
  const elGoScheduleBtn = qs("#goScheduleBtn");

  // Deadlines
  const elDeadlineSearch = qs("#deadlineSearch");
  const elDeadlineFilter = qs("#deadlineFilter");
  const elDeadlineSort = qs("#deadlineSort");
  const elAddDeadlineBtn = qs("#addDeadlineBtn");
  const elDeadlinesList = qs("#deadlinesList");
  const elDeadlinesEmpty = qs("#deadlinesEmpty");
  const elDeadlineCount = qs("#deadlineCount");
  const elEmptyAddDeadlineBtn = qs("#emptyAddDeadlineBtn");

  // Schedule
  const elScheduleWeek = qs("#scheduleWeek");
  const elClassSearch = qs("#classSearch");
  const elAddClassBtn = qs("#addClassBtn");
  const elWeekView = qs("#weekView");
  const elScheduleHint = qs("#scheduleHint");
  const elClassesList = qs("#classesList");
  const elClassesEmpty = qs("#classesEmpty");
  const elClassCount = qs("#classCount");
  const elEmptyAddClassBtn = qs("#emptyAddClassBtn");

  // Calendar
  const elCalPrevBtn = qs("#calPrevBtn");
  const elCalNextBtn = qs("#calNextBtn");
  const elCalTodayBtn = qs("#calTodayBtn");
  const elCalTitle = qs("#calTitle");
  const elCalendarGrid = qs("#calendarGrid");
  const elDayDetailTitle = qs("#dayDetailTitle");
  const elDayDetailList = qs("#dayDetailList");
  const elDayDetailEmpty = qs("#dayDetailEmpty");

  // Modal/editor
  const elModal = qs("#editorModal");
  const elEditorForm = qs("#editorForm");
  const elModalTitle = qs("#modalTitle");
  const elModalSubtitle = qs("#modalSubtitle");
  const elCloseModalBtn = qs("#closeModalBtn");
  const elCancelBtn = qs("#cancelBtn");
  const elSaveBtn = qs("#saveBtn");
  const elDeleteBtn = qs("#deleteBtn");
  const elKindChips = Array.from(document.querySelectorAll(".chip"));
  const elEditorKind = qs("#editorKind");
  const elEditorId = qs("#editorId");
  const elDeadlineFields = qs("#deadlineFields");
  const elClassFields = qs("#classFields");
  const elPriorityButtons = Array.from(document.querySelectorAll("#priorityButtons .segmented__btn"));
  const elDayButtons = Array.from(document.querySelectorAll("#dayButtons .segmented__btn"));

  const fTitle = qs("#fTitle");
  const fCourse = qs("#fCourse");
  const fDue = qs("#fDue");
  const fPriority = qs("#fPriority");
  const fDeadlineColor = qs("#fDeadlineColor");
  const fDay = qs("#fDay");
  const fColor = qs("#fColor");
  const fStart = qs("#fStart");
  const fEnd = qs("#fEnd");
  const fLocation = qs("#fLocation");
  const fTeacher = qs("#fTeacher");
  const fNotes = qs("#fNotes");

  let calendarCursor = startOfDay(new Date());
  calendarCursor.setDate(1);
  let selectedDayISO = toISODate(new Date());

  const setActiveView = (view) => {
    elNavItems.forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    elViews.forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
    const titleMap = {
      dashboard: { t: "Tổng quan", s: "Theo dõi deadline, lịch học và kế hoạch tuần." },
      deadlines: { t: "Deadline", s: "Thêm, tìm, lọc và đánh dấu hoàn thành." },
      schedule: { t: "Lịch học", s: "Xem theo tuần và quản lý buổi học." },
      calendar: { t: "Lịch tháng", s: "Tổng hợp deadline & lịch học theo ngày." },
    };
    const x = titleMap[view] || titleMap.dashboard;
    elViewTitle.textContent = x.t;
    elViewSubtitle.textContent = x.s;

    // Close sidebar on mobile after navigation
    elSidebar.classList.remove("is-open");
  };

  const priorityPillClass = (p) => {
    if (p === "high") return "pill pill--high";
    if (p === "low") return "pill pill--low";
    return "pill pill--med";
  };

  const setPriority = (p) => {
    const val = p === "high" || p === "low" ? p : "medium";
    fPriority.value = val;
    elPriorityButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.priority === val);
    });
  };

  const setDay = (day) => {
    const d = clamp(Number(day), 0, 6);
    fDay.value = String(d);
    elDayButtons.forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.day) === d);
    });
  };

  const deadlineStatusPill = (d) => {
    if (d.done) return { text: "Đã xong", cls: "pill pill--done" };
    const due = parseLocalDateTime(d.dueLocal);
    if (!due) return { text: "Chưa đặt hạn", cls: "pill" };
    if (due.getTime() < Date.now()) return { text: "Quá hạn", cls: "pill pill--overdue" };
    return { text: "Chưa xong", cls: "pill" };
  };

  const deadlineMatchesFilter = (d, filter) => {
    const due = parseLocalDateTime(d.dueLocal);
    const now = new Date();
    const today0 = startOfDay(now).getTime();
    const tomorrow0 = startOfDay(addDays(now, 1)).getTime();
    const sevenDays = startOfDay(addDays(now, 7)).getTime();

    if (filter === "open") return !d.done;
    if (filter === "done") return d.done;
    if (filter === "overdue") return !d.done && !!due && due.getTime() < Date.now();
    if (filter === "today") return !!due && due.getTime() >= today0 && due.getTime() < tomorrow0;
    if (filter === "7d") return !d.done && !!due && due.getTime() >= today0 && due.getTime() < sevenDays;
    return true;
  };

  const renderDeadlines = () => {
    const q = safeText(elDeadlineSearch.value).toLowerCase();
    const filter = elDeadlineFilter.value;
    const sort = elDeadlineSort.value;

    let items = state.deadlines.slice();
    if (q) {
      items = items.filter((d) => {
        const hay = `${d.title} ${d.course} ${d.notes}`.toLowerCase();
        return hay.includes(q);
      });
    }
    items = items.filter((d) => deadlineMatchesFilter(d, filter));

    const dueMs = (d) => (parseLocalDateTime(d.dueLocal)?.getTime() ?? Number.POSITIVE_INFINITY);
    const priorityRank = (p) => (p === "high" ? 3 : p === "medium" ? 2 : 1);
    if (sort === "dueAsc") items.sort((a, b) => dueMs(a) - dueMs(b));
    if (sort === "dueDesc") items.sort((a, b) => dueMs(b) - dueMs(a));
    if (sort === "priorityDesc") items.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    if (sort === "createdDesc") items.sort((a, b) => b.createdAt - a.createdAt);

    elDeadlineCount.textContent = `${items.length} mục`;
    elDeadlinesList.innerHTML = "";
    elDeadlinesEmpty.hidden = items.length !== 0;

    for (const d of items) {
      const due = parseLocalDateTime(d.dueLocal);
      const status = deadlineStatusPill(d);
      const color = d.color || "#ffcc66";
      const wrap = document.createElement("div");
      wrap.className = "item";
      wrap.dataset.id = d.id;
      wrap.innerHTML = `
        <div class="item__main">
          <div class="item__title">
            <span>${escapeHtml(d.title || "(Không tiêu đề)")}</span>
            ${d.course ? `<span class="pill">${escapeHtml(d.course)}</span>` : ""}
            <span class="pill" title="Màu deadline" style="border-color:${escapeAttr(color)}; color:${escapeAttr(
        color
      )}; background: color-mix(in oklab, ${escapeAttr(color)} 14%, transparent);">●</span>
            <span class="${priorityPillClass(d.priority)}">${d.priority === "high" ? "Cao" : d.priority === "low" ? "Thấp" : "Vừa"}</span>
            <span class="${status.cls}">${status.text}</span>
          </div>
          <div class="item__meta">
            <span>${due ? `Hạn: ${escapeHtml(formatDateTimeVI(due))}` : "Chưa đặt hạn"}</span>
            ${d.notes ? `<span>Ghi chú: ${escapeHtml(truncate(d.notes, 60))}</span>` : ""}
          </div>
        </div>
        <div class="item__actions">
          <button class="smallBtn smallBtn--ok" type="button" data-action="toggleDone">${d.done ? "Hoàn tác" : "Xong"}</button>
          <button class="smallBtn" type="button" data-action="edit">Sửa</button>
        </div>
      `;
      elDeadlinesList.appendChild(wrap);
    }
  };

  const renderClasses = () => {
    const q = safeText(elClassSearch.value).toLowerCase();
    let items = state.classes.slice();
    if (q) {
      items = items.filter((c) => {
        const hay = `${c.title} ${c.course} ${c.location} ${c.teacher} ${c.notes}`.toLowerCase();
        return hay.includes(q);
      });
    }
    items.sort((a, b) => b.createdAt - a.createdAt);

    elClassCount.textContent = `${items.length} mục`;
    elClassesList.innerHTML = "";
    elClassesEmpty.hidden = items.length !== 0;

    for (const c of items) {
      const dayName = byDayKey(c.day).long;
      const wrap = document.createElement("div");
      wrap.className = "item";
      wrap.dataset.id = c.id;
      wrap.innerHTML = `
        <div class="item__main">
          <div class="item__title">
            <span>${escapeHtml(c.title || "(Không tiêu đề)")}</span>
            ${c.course ? `<span class="pill">${escapeHtml(c.course)}</span>` : ""}
            <span class="pill">${escapeHtml(dayName)}</span>
            ${c.location ? `<span class="pill">${escapeHtml(c.location)}</span>` : ""}
          </div>
          <div class="item__meta">
            <span>${escapeHtml(formatTime(c.start))}–${escapeHtml(formatTime(c.end))}</span>
            ${c.teacher ? `<span>GV: ${escapeHtml(c.teacher)}</span>` : ""}
            ${c.notes ? `<span>Ghi chú: ${escapeHtml(truncate(c.notes, 60))}</span>` : ""}
          </div>
        </div>
        <div class="item__actions">
          <span class="pill" title="Màu" style="border-color:${escapeAttr(c.color)}; color:${escapeAttr(c.color)}; background: color-mix(in oklab, ${escapeAttr(
        c.color
      )} 14%, transparent);">●</span>
          <button class="smallBtn" type="button" data-action="edit">Sửa</button>
        </div>
      `;
      elClassesList.appendChild(wrap);
    }
  };

  const getWeekMondayFromWeekInput = (weekStr) => {
    const s = safeText(weekStr);
    const m = /^(\d{4})-W(\d{2})$/.exec(s);
    if (!m) return null;
    const y = Number(m[1]);
    const w = Number(m[2]);
    // ISO week: week 1 contains Jan 4th.
    const jan4 = new Date(y, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7; // Mon=0..Sun=6
    const mondayWeek1 = addDays(startOfDay(jan4), -jan4Day);
    return addDays(mondayWeek1, (w - 1) * 7);
  };

  const getDefaultWeekInputValue = () => {
    // best-effort: use browser-provided value by setting and reading
    const tmp = document.createElement("input");
    tmp.type = "week";
    tmp.valueAsDate = new Date();
    return tmp.value;
  };

  const eventsForDateISO = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0, 0);
    const dow = date.getDay();

    const deadlines = state.deadlines
      .map((x) => ({ ...x, due: parseLocalDateTime(x.dueLocal) }))
      .filter((x) => x.due && toISODate(x.due) === iso)
      .sort((a, b) => a.due.getTime() - b.due.getTime());

    const classes = state.classes
      .filter((c) => c.day === dow)
      .slice()
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

    return { deadlines, classes };
  };

  const renderWeek = () => {
    const monday = getWeekMondayFromWeekInput(elScheduleWeek.value);
    if (!monday) {
      elScheduleHint.textContent = "Chọn tuần để xem chi tiết.";
      elWeekView.innerHTML = "";
      return;
    }
    const sunday = addDays(monday, 6);
    elScheduleHint.textContent = `${formatDateVI(monday)} – ${formatDateVI(sunday)}`;

    elWeekView.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      const iso = toISODate(day);
      const dow = day.getDay();
      const dayName = byDayKey(dow);
      const { deadlines, classes } = eventsForDateISO(iso);

      const col = document.createElement("div");
      col.className = "dayCol";
      col.innerHTML = `
        <div class="dayCol__head">
          <div class="dayCol__name">${escapeHtml(dayName.short)}</div>
          <div class="dayCol__date">${escapeHtml(formatDateVI(day))}</div>
        </div>
        <div class="dayCol__body"></div>
      `;
      const body = qs(".dayCol__body", col);

      for (const c of classes) {
        const chip = document.createElement("div");
        chip.className = "chipEvent";
        chip.innerHTML = `
          <div class="bar" style="background:${escapeAttr(c.color)}"></div>
          <div class="chipEvent__title">${escapeHtml(c.title || "(Không tiêu đề)")}</div>
          <div class="chipEvent__meta">
            <span>${escapeHtml(formatTime(c.start))}–${escapeHtml(formatTime(c.end))}</span>
            ${c.location ? `<span>${escapeHtml(c.location)}</span>` : ""}
          </div>
        `;
        body.appendChild(chip);
      }

      for (const d of deadlines) {
        const due = d.due;
        const status = deadlineStatusPill(d);
        const barColor = d.color || "#ffcc66";
        const chip = document.createElement("div");
        chip.className = "chipEvent";
        chip.innerHTML = `
          <div class="bar" style="background:${escapeAttr(barColor)}"></div>
          <div class="chipEvent__title">${escapeHtml(d.title || "(Không tiêu đề)")}</div>
          <div class="chipEvent__meta">
            <span>${escapeHtml(d.course || "Deadline")}</span>
            <span>${escapeHtml(due ? `${pad2(due.getHours())}:${pad2(due.getMinutes())}` : "")}</span>
            <span class="${status.cls}">${status.text}</span>
          </div>
        `;
        body.appendChild(chip);
      }

      if (!classes.length && !deadlines.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "Không có sự kiện.";
        body.appendChild(empty);
      }

      elWeekView.appendChild(col);
    }
  };

  const renderDashboard = () => {
    const now = new Date();
    const todayISO = toISODate(now);
    const today0 = startOfDay(now).getTime();
    const next7 = startOfDay(addDays(now, 7)).getTime();

    const upcoming = state.deadlines
      .filter((d) => !d.done)
      .map((d) => ({ ...d, due: parseLocalDateTime(d.dueLocal) }))
      .filter((d) => d.due && d.due.getTime() >= today0 && d.due.getTime() < next7)
      .sort((a, b) => a.due.getTime() - b.due.getTime());

    elKpiUpcoming.textContent = String(upcoming.length);
    elKpiUpcomingMeta.textContent = upcoming.length ? `Gần nhất: ${escapeText(upcoming[0].title || "—")}` : "Không có deadline gần.";

    const todayEvents = (() => {
      const { deadlines, classes } = eventsForDateISO(todayISO);
      const openDeadlinesToday = deadlines.filter((d) => !d.done);
      return openDeadlinesToday.length + classes.length;
    })();
    elKpiToday.textContent = String(todayEvents);
    elKpiTodayMeta.textContent = todayEvents ? "Có sự kiện hôm nay." : "Không có sự kiện hôm nay.";

    const days30 = startOfDay(addDays(now, -30)).getTime();
    const last30 = state.deadlines
      .map((d) => ({ ...d, due: parseLocalDateTime(d.dueLocal) }))
      .filter((d) => d.due && d.due.getTime() >= days30 && d.due.getTime() <= Date.now());
    const done30 = last30.filter((d) => d.done).length;
    const pct = last30.length ? Math.round((done30 / last30.length) * 100) : 0;
    elKpiDone.textContent = `${pct}%`;
    elKpiDoneMeta.textContent = `Đã xong ${done30}/${last30.length} deadline (30 ngày).`;

    // Lists
    elDashDeadlinesList.innerHTML = "";
    const nextItems = state.deadlines
      .filter((d) => !d.done)
      .map((d) => ({ ...d, due: parseLocalDateTime(d.dueLocal) }))
      .filter((d) => d.due)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 5);

    if (!nextItems.length) {
      elDashDeadlinesList.innerHTML = `<div class="muted">Chưa có deadline.</div>`;
    } else {
      for (const d of nextItems) {
        const due = d.due;
        const color = d.color || "#ffcc66";
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <div class="item__main">
            <div class="item__title">
              <span>${escapeHtml(d.title || "(Không tiêu đề)")}</span>
              ${d.course ? `<span class="pill">${escapeHtml(d.course)}</span>` : ""}
              <span class="pill" title="Màu deadline" style="border-color:${escapeAttr(color)}; color:${escapeAttr(
        color
      )}; background: color-mix(in oklab, ${escapeAttr(color)} 14%, transparent);">●</span>
            </div>
            <div class="item__meta">
              <span>Hạn: ${escapeHtml(due ? formatDateTimeVI(due) : "—")}</span>
            </div>
          </div>
          <div class="item__actions">
            <button class="smallBtn" type="button" data-action="openDeadline" data-id="${escapeAttr(d.id)}">Mở</button>
          </div>
        `;
        elDashDeadlinesList.appendChild(row);
      }
    }

    elDashTodayClassesList.innerHTML = "";
    const todays = eventsForDateISO(todayISO).classes;
    if (!todays.length) {
      elDashTodayClassesList.innerHTML = `<div class="muted">Không có buổi học hôm nay.</div>`;
    } else {
      for (const c of todays) {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <div class="item__main">
            <div class="item__title">
              <span>${escapeHtml(c.title || "(Không tiêu đề)")}</span>
              ${c.location ? `<span class="pill">${escapeHtml(c.location)}</span>` : ""}
            </div>
            <div class="item__meta">
              <span>${escapeHtml(formatTime(c.start))}–${escapeHtml(formatTime(c.end))}</span>
              ${c.teacher ? `<span>GV: ${escapeHtml(c.teacher)}</span>` : ""}
            </div>
          </div>
          <div class="item__actions">
            <button class="smallBtn" type="button" data-action="openClass" data-id="${escapeAttr(c.id)}">Mở</button>
          </div>
        `;
        elDashTodayClassesList.appendChild(row);
      }
    }
  };

  const monthTitleVI = (d) => `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;

  const renderCalendar = () => {
    const cursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1, 12, 0, 0, 0);
    elCalTitle.textContent = monthTitleVI(cursor);

    // Monday as week start.
    const firstDowMon0 = (cursor.getDay() + 6) % 7; // Mon=0..Sun=6
    const gridStart = addDays(cursor, -firstDowMon0);

    elCalendarGrid.innerHTML = "";
    for (let i = 0; i < 42; i++) {
      const day = addDays(gridStart, i);
      const iso = toISODate(day);
      const isOut = day.getMonth() !== cursor.getMonth();

      const { deadlines, classes } = eventsForDateISO(iso);
      const hasDeadline = deadlines.length > 0;
      const hasClass = classes.length > 0;
      const deadlineColor = hasDeadline ? deadlines[0].color || "#ffcc66" : "";

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calCell";
      if (isOut) cell.classList.add("is-out");
      if (iso === selectedDayISO) cell.classList.add("is-selected");
      cell.dataset.iso = iso;
      cell.innerHTML = `
        <div class="calTop">
          <div class="calDay">${day.getDate()}</div>
          <div class="calDots">
            ${hasDeadline ? `<span class="dot dot--deadline" title="Deadline" style="${deadlineColor ? `background:${escapeAttr(deadlineColor)}` : ""}"></span>` : ""}
            ${hasClass ? `<span class="dot dot--class" title="Buổi học"></span>` : ""}
          </div>
        </div>
        <div class="muted">${escapeHtml(byDayKey(day.getDay()).short)}</div>
      `;
      elCalendarGrid.appendChild(cell);
    }

    renderDayDetail(selectedDayISO);
  };

  const renderDayDetail = (iso) => {
    selectedDayISO = iso;
    const { deadlines, classes } = eventsForDateISO(iso);
    elDayDetailList.innerHTML = "";
    elDayDetailEmpty.hidden = deadlines.length + classes.length !== 0;
    elDayDetailTitle.textContent = `Ngày ${iso.split("-").reverse().join("/")}`;

    for (const c of classes) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item__main">
          <div class="item__title">
            <span>${escapeHtml(c.title || "(Không tiêu đề)")}</span>
            ${c.location ? `<span class="pill">${escapeHtml(c.location)}</span>` : ""}
          </div>
          <div class="item__meta">
            <span>Buổi học</span>
            <span>${escapeHtml(formatTime(c.start))}–${escapeHtml(formatTime(c.end))}</span>
            ${c.course ? `<span>${escapeHtml(c.course)}</span>` : ""}
          </div>
        </div>
        <div class="item__actions">
          <button class="smallBtn" type="button" data-action="openClass" data-id="${escapeAttr(c.id)}">Mở</button>
        </div>
      `;
      elDayDetailList.appendChild(row);
    }

    for (const d of deadlines) {
      const status = deadlineStatusPill(d);
      const due = d.due;
      const color = d.color || "#ffcc66";
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item__main">
          <div class="item__title">
            <span>${escapeHtml(d.title || "(Không tiêu đề)")}</span>
            ${d.course ? `<span class="pill">${escapeHtml(d.course)}</span>` : ""}
            <span class="pill" title="Màu deadline" style="border-color:${escapeAttr(color)}; color:${escapeAttr(
        color
      )}; background: color-mix(in oklab, ${escapeAttr(color)} 14%, transparent);">●</span>
            <span class="${status.cls}">${status.text}</span>
          </div>
          <div class="item__meta">
            <span>Deadline</span>
            <span>${escapeHtml(due ? `${pad2(due.getHours())}:${pad2(due.getMinutes())}` : "")}</span>
          </div>
        </div>
        <div class="item__actions">
          <button class="smallBtn" type="button" data-action="openDeadline" data-id="${escapeAttr(d.id)}">Mở</button>
        </div>
      `;
      elDayDetailList.appendChild(row);
    }
  };

  const renderAll = () => {
    renderDashboard();
    renderDeadlines();
    renderClasses();
    renderWeek();
    renderCalendar();
  };

  const openModal = (kind, id = "") => {
    setEditorKind(kind);
    elEditorId.value = id || "";
    elDeleteBtn.hidden = !id;

    if (kind === "deadline") {
      elModalTitle.textContent = id ? "Sửa deadline" : "Thêm deadline";
      elModalSubtitle.textContent = "Điền thông tin deadline rồi bấm Lưu.";
    } else {
      elModalTitle.textContent = id ? "Sửa buổi học" : "Thêm buổi học";
      elModalSubtitle.textContent = "Điền thông tin buổi học rồi bấm Lưu.";
    }

    if (id) {
      if (kind === "deadline") {
        const d = state.deadlines.find((x) => x.id === id);
        if (d) fillEditorFromDeadline(d);
      } else {
        const c = state.classes.find((x) => x.id === id);
        if (c) fillEditorFromClass(c);
      }
    } else {
      clearEditor(kind);
    }

    if (typeof elModal.showModal === "function") elModal.showModal();
    else elModal.setAttribute("open", "open");
  };

  const closeModal = () => {
    if (typeof elModal.close === "function") elModal.close();
    else elModal.removeAttribute("open");
  };

  const setEditorKind = (kind) => {
    elEditorKind.value = kind;
    elKindChips.forEach((c) => c.classList.toggle("is-active", c.dataset.kind === kind));
    const isDeadline = kind === "deadline";
    elDeadlineFields.hidden = !isDeadline;
    elClassFields.hidden = isDeadline;
    fDue.required = isDeadline;
    fStart.required = !isDeadline;
    fEnd.required = !isDeadline;
  };

  const clearEditor = (kind) => {
    elEditorId.value = "";
    fTitle.value = "";
    fCourse.value = "";
    fNotes.value = "";
    setPriority("medium");

    // Set sensible defaults
    const now = new Date();
    const dt = `${toISODate(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    fDue.value = dt;
    const dow = now.getDay();
    const defaultDay = dow === 0 ? 0 : clamp(dow, 1, 6);
    setDay(defaultDay);
    fDeadlineColor.value = "#ffcc66";
    fColor.value = "#6d5efc";
    fStart.value = "07:30";
    fEnd.value = "09:10";
    fLocation.value = "";
    fTeacher.value = "";

    setEditorKind(kind);
  };

  /** @param {Deadline} d */
  const fillEditorFromDeadline = (d) => {
    setEditorKind("deadline");
    fTitle.value = d.title || "";
    fCourse.value = d.course || "";
    fDue.value = d.dueLocal || "";
    setPriority(d.priority || "medium");
    fDeadlineColor.value = d.color || "#ffcc66";
    fNotes.value = d.notes || "";
  };

  /** @param {ClassItem} c */
  const fillEditorFromClass = (c) => {
    setEditorKind("class");
    fTitle.value = c.title || "";
    fCourse.value = c.course || "";
    setDay(c.day);
    fColor.value = c.color || "#6d5efc";
    fStart.value = c.start || "";
    fEnd.value = c.end || "";
    fLocation.value = c.location || "";
    fTeacher.value = c.teacher || "";
    fNotes.value = c.notes || "";
  };

  const upsertDeadlineFromForm = (id) => {
    const title = safeText(fTitle.value);
    const course = safeText(fCourse.value);
    const dueLocal = safeText(fDue.value);
    const due = parseLocalDateTime(dueLocal);
    if (!title) throw new Error("Vui lòng nhập tiêu đề.");
    if (!due) throw new Error("Vui lòng chọn hạn nộp hợp lệ.");

    const priority = fPriority.value === "high" || fPriority.value === "low" ? fPriority.value : "medium";
    const color = safeText(fDeadlineColor.value) || "#ffcc66";
    const notes = safeText(fNotes.value);
    const now = Date.now();

    if (id) {
      const idx = state.deadlines.findIndex((d) => d.id === id);
      if (idx >= 0) {
        const prev = state.deadlines[idx];
        state.deadlines[idx] = {
          ...prev,
          title,
          course,
          dueLocal,
          priority,
          color,
          notes,
        };
      }
    } else {
      /** @type {Deadline} */
      const d = {
        id: uid(),
        kind: "deadline",
        title,
        course,
        dueLocal,
        priority,
        color,
        notes,
        createdAt: now,
        done: false,
        doneAt: null,
      };
      state.deadlines.unshift(d);
    }
  };

  const upsertClassFromForm = (id) => {
    const title = safeText(fTitle.value);
    const course = safeText(fCourse.value);
    const day = clamp(Number(fDay.value), 0, 6);
    const color = safeText(fColor.value) || "#6d5efc";
    const start = safeText(fStart.value);
    const end = safeText(fEnd.value);
    const location = safeText(fLocation.value);
    const teacher = safeText(fTeacher.value);
    const notes = safeText(fNotes.value);
    if (!title) throw new Error("Vui lòng nhập tiêu đề.");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error("Giờ bắt đầu/kết thúc chưa hợp lệ.");
    const now = Date.now();

    if (id) {
      const idx = state.classes.findIndex((c) => c.id === id);
      if (idx >= 0) {
        const prev = state.classes[idx];
        state.classes[idx] = {
          ...prev,
          title,
          course,
          day,
          color,
          start,
          end,
          location,
          teacher,
          notes,
        };
      }
    } else {
      /** @type {ClassItem} */
      const c = {
        id: uid(),
        kind: "class",
        title,
        course,
        day,
        color,
        start,
        end,
        location,
        teacher,
        notes,
        createdAt: now,
      };
      state.classes.unshift(c);
    }
  };

  const deleteByEditor = () => {
    const id = safeText(elEditorId.value);
    const kind = elEditorKind.value;
    if (!id) return;
    // eslint-disable-next-line no-alert
    const ok = confirm("Xoá mục này?");
    if (!ok) return;
    if (kind === "deadline") state.deadlines = state.deadlines.filter((d) => d.id !== id);
    else state.classes = state.classes.filter((c) => c.id !== id);
    saveState(state);
    closeModal();
    renderAll();
  };

  const toggleDone = (id) => {
    const d = state.deadlines.find((x) => x.id === id);
    if (!d) return;
    d.done = !d.done;
    d.doneAt = d.done ? Date.now() : null;
    saveState(state);
    renderAll();
  };

  const escapeText = (s) => safeText(s);
  const escapeHtml = (s) =>
    escapeText(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const escapeAttr = escapeHtml;
  const truncate = (s, n) => {
    const t = safeText(s);
    if (t.length <= n) return t;
    return `${t.slice(0, n - 1)}…`;
  };

  // Events wiring
  elToggleSidebarBtn.addEventListener("click", () => elSidebar.classList.toggle("is-open"));

  elNavItems.forEach((b) =>
    b.addEventListener("click", () => {
      setActiveView(b.dataset.view || "dashboard");
      renderAll();
    })
  );

  elGoDeadlinesBtn.addEventListener("click", () => {
    setActiveView("deadlines");
    renderAll();
  });
  elGoScheduleBtn.addEventListener("click", () => {
    setActiveView("schedule");
    renderAll();
  });

  elQuickAddDeadlineBtn.addEventListener("click", () => openModal("deadline"));
  elQuickAddClassBtn.addEventListener("click", () => openModal("class"));
  elAddDeadlineBtn.addEventListener("click", () => openModal("deadline"));
  elEmptyAddDeadlineBtn.addEventListener("click", () => openModal("deadline"));
  elAddClassBtn.addEventListener("click", () => openModal("class"));
  elEmptyAddClassBtn.addEventListener("click", () => openModal("class"));

  elDeadlineSearch.addEventListener("input", renderDeadlines);
  elDeadlineFilter.addEventListener("change", renderDeadlines);
  elDeadlineSort.addEventListener("change", renderDeadlines);

  elPriorityButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      const p = btn.dataset.priority === "high" || btn.dataset.priority === "low" ? btn.dataset.priority : "medium";
      setPriority(p);
    })
  );

  elDayButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      const d = Number(btn.dataset.day);
      setDay(d);
    })
  );

  elClassSearch.addEventListener("input", () => {
    renderClasses();
    renderWeek();
    renderCalendar();
  });

  elScheduleWeek.addEventListener("change", () => {
    renderWeek();
  });

  // List clicks (delegation)
  elDeadlinesList.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target.closest("button[data-action]") : null);
    if (!btn) return;
    const item = btn.closest(".item");
    const id = item?.dataset.id;
    if (!id) return;
    const action = btn.dataset.action;
    if (action === "edit") openModal("deadline", id);
    if (action === "toggleDone") toggleDone(id);
  });

  elClassesList.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target.closest("button[data-action]") : null);
    if (!btn) return;
    const item = btn.closest(".item");
    const id = item?.dataset.id;
    if (!id) return;
    if (btn.dataset.action === "edit") openModal("class", id);
  });

  elDashDeadlinesList.addEventListener("click", (e) => {
    const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    if (btn.dataset.action === "openDeadline") {
      openModal("deadline", btn.dataset.id || "");
    }
  });

  elDashTodayClassesList.addEventListener("click", (e) => {
    const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    if (btn.dataset.action === "openClass") openModal("class", btn.dataset.id || "");
  });

  elCalendarGrid.addEventListener("click", (e) => {
    const cell = e.target instanceof HTMLElement ? e.target.closest(".calCell") : null;
    if (!cell) return;
    const iso = cell.dataset.iso;
    if (!iso) return;
    selectedDayISO = iso;
    renderCalendar();
  });

  elDayDetailList.addEventListener("click", (e) => {
    const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-action]") : null;
    if (!btn) return;
    if (btn.dataset.action === "openDeadline") openModal("deadline", btn.dataset.id || "");
    if (btn.dataset.action === "openClass") openModal("class", btn.dataset.id || "");
  });

  elCalPrevBtn.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1, 12, 0, 0, 0);
    renderCalendar();
  });
  elCalNextBtn.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1, 12, 0, 0, 0);
    renderCalendar();
  });
  elCalTodayBtn.addEventListener("click", () => {
    const t = new Date();
    calendarCursor = new Date(t.getFullYear(), t.getMonth(), 1, 12, 0, 0, 0);
    selectedDayISO = toISODate(t);
    renderCalendar();
  });

  elKindChips.forEach((chip) =>
    chip.addEventListener("click", () => {
      const kind = chip.dataset.kind === "class" ? "class" : "deadline";
      setEditorKind(kind);
    })
  );

  elCloseModalBtn.addEventListener("click", closeModal);
  elCancelBtn.addEventListener("click", closeModal);
  elDeleteBtn.addEventListener("click", deleteByEditor);

  elEditorForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const kind = elEditorKind.value === "class" ? "class" : "deadline";
    const id = safeText(elEditorId.value);
    try {
      if (kind === "deadline") upsertDeadlineFromForm(id);
      else upsertClassFromForm(id);
      saveState(state);
      closeModal();
      renderAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Không thể lưu.");
    }
  });

  elExportBtn.addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: state,
    };
    downloadText(`deadline-lichhoc-${Date.now()}.json`, JSON.stringify(payload, null, 2));
  });

  elResetBtn.addEventListener("click", () => {
    // eslint-disable-next-line no-alert
    const ok = confirm("Reset sẽ xoá toàn bộ deadline và lịch học. Tiếp tục?");
    if (!ok) return;
    state = { deadlines: [], classes: [] };
    saveState(state);
    renderAll();
  });

  // ─── NOTIFICATION SYSTEM ───────────────────────────────────────────────────

  const NOTIF_KEY = "dl_notified_ids_v1";
  const NOTIF_THRESHOLDS = [
    { ms: 24 * 60 * 60 * 1000, label: "còn 1 ngày" },
    { ms:  3 * 60 * 60 * 1000, label: "còn 3 tiếng" },
    { ms:  1 * 60 * 60 * 1000, label: "còn 1 tiếng" },
  ];

  /** Load set of already-notified keys from localStorage */
  const loadNotifiedSet = () => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  };

  /** Persist notified key set */
  const saveNotifiedSet = (set) => {
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
  };

  /** Show a single browser notification */
  const sendNotif = (title, body) => {
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, {
        body,
        icon: "https://cdn-icons-png.flaticon.com/512/2693/2693507.png",
        tag: title,
      });
    } catch { /* ignore — some browsers block in certain contexts */ }
  };

  /** Scan deadlines and fire notifications for upcoming ones */
  const checkAndNotify = () => {
    if (Notification.permission !== "granted") return;
    const now = Date.now();
    const notified = loadNotifiedSet();
    let changed = false;

    for (const d of state.deadlines) {
      if (d.done) continue;
      const due = parseLocalDateTime(d.dueLocal);
      if (!due) continue;
      const diff = due.getTime() - now;
      if (diff < 0) continue; // already overdue

      for (const { ms, label } of NOTIF_THRESHOLDS) {
        const key = `${d.id}_${ms}`;
        // Fire if within threshold window (threshold ± 5 min buffer)
        if (diff <= ms + 5 * 60 * 1000 && diff > ms - 5 * 60 * 1000 && !notified.has(key)) {
          sendNotif(
            `⏰ Deadline sắp tới: ${d.title || "Không tên"}`,
            `${d.course ? `[${d.course}] ` : ""}Hạn nộp ${label} — ${formatDateTimeVI(due)}`
          );
          notified.add(key);
          changed = true;
        }
      }
    }
    if (changed) saveNotifiedSet(notified);
  };

  /** Inject the notification permission banner into sidebar footer */
  const renderNotifBanner = () => {
    const footer = qso(".sidebar__footer");
    if (!footer) return;
    const existing = qso("#notifBanner");
    if (existing) existing.remove();

    const perm = Notification.permission;
    if (perm === "granted") {
      // Show subtle status badge only
      const badge = document.createElement("div");
      badge.id = "notifBanner";
      badge.style.cssText = "margin-top:8px;font-size:11px;color:#6ee7b7;display:flex;align-items:center;gap:4px;";
      badge.innerHTML = `<span>🔔</span><span>Thông báo đang bật</span>`;
      footer.appendChild(badge);
    } else if (perm === "default") {
      const wrap = document.createElement("div");
      wrap.id = "notifBanner";
      wrap.style.cssText = "margin-top:10px;";
      wrap.innerHTML = `
        <div style="font-size:11px;color:var(--text-muted,#aaa);margin-bottom:4px;">Bật thông báo deadline?</div>
        <button id="enableNotifBtn" style="
          width:100%;padding:5px 0;border-radius:6px;border:none;cursor:pointer;
          background:var(--accent,#6d5efc);color:#fff;font-size:12px;font-weight:600;
        ">🔔 Bật thông báo</button>`;
      footer.appendChild(wrap);

      qso("#enableNotifBtn")?.addEventListener("click", async () => {
        const result = await Notification.requestPermission();
        renderNotifBanner();
        if (result === "granted") {
          sendNotif("✅ SMARTSTUDY PLANNER", "Thông báo đã được bật! Bạn sẽ nhận nhắc nhở khi deadline sắp đến.");
          checkAndNotify();
        }
      });
    }
    // If "denied" — show nothing, don't nag the user
  };

  /** Boot the notification system */
  const initNotifications = () => {
    if (!("Notification" in window)) return; // browser doesn't support
    renderNotifBanner();
    if (Notification.permission === "granted") {
      checkAndNotify();
      // Check every 5 minutes
      setInterval(checkAndNotify, 5 * 60 * 1000);
    }
  };

  // Init
  if (!elScheduleWeek.value) elScheduleWeek.value = getDefaultWeekInputValue();
  setActiveView("dashboard");
  renderAll();
  initNotifications();
})();

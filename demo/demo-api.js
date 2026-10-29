/* Демо-сервер барбершопа прямо в браузере: подменяет api() мини-приложения, чтобы на сайте
   работало всё без настоящего сервера. Данные выдуманные и живут до перезагрузки страницы.
   Логика повторяет ~/Claude/Барбершоп/app/src/server.js и model.js. */
(function(){
  // вне Telegram его скрипт всё равно создаёт WebApp, но showConfirm там падает — притворяемся обычным браузером
  window.Telegram = undefined;
  const SHOP = { name: "Барбершоп «Демо»", address: "ул. Примерная, 1" };
  const LOYALTY = { coinsPercent: 10, visitsForGift: 8, phoneBonus: 150 };
  const SERVICES = [
    { id: "cut", name: "Стрижка", price: 1700, minutes: 60 },
    { id: "beard", name: "Моделирование бороды", price: 1000, minutes: 30 },
    { id: "cut_beard", name: "Стрижка и моделирование бороды", price: 2300, minutes: 90 },
    { id: "wax", name: "Удаление волос воском (нос + уши)", price: 300, minutes: 5 },
    { id: "kids", name: "Детская стрижка", price: 1400, minutes: 60 },
    { id: "camo", name: "Камуфляж", price: 800, minutes: 30 },
    { id: "fade", name: "Fade (плавный переход)", price: 1400, minutes: 60 },
    { id: "father_son", name: "Отец + сын", price: 2800, minutes: 90 },
  ];
  const WEEK = { 0: null, 1: ["10:00","18:00"], 2: ["10:00","18:00"], 3: ["10:00","18:00"], 4: ["10:00","20:00"], 5: ["10:00","20:00"], 6: ["10:00","20:00"] };
  const STEP = 30, LEAD = 60, HORIZON = 14, BACK_AFTER = 21;
  const ROOM_PRICE = { night: 100, emerald: 100, amethyst: 100, loft: 200, jungle: 250, space: 300, atlantis: 350, bazaar: 400 };
  const UNLOCK = { cut: { crop: 0, fade: 1, classic: 1 }, frame: { brass: 0, silver: 5, gold: 10 } };

  /* --- время (московское, как на сервере) --- */
  const wall = () => new Date(Date.now() + 3 * 3600e3);
  const nowStamp = () => wall().toISOString().slice(0, 16).replace("T", " ");
  const today = () => nowStamp().slice(0, 10);
  const toMin = hm => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
  const fromMin = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const addDays = (date, n) => { const d = new Date(date + "T00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekday = date => new Date(date + "T00:00Z").getUTCDay();
  const WD = ["вс","пн","вт","ср","чт","пт","сб"], MON = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
  const human = s => { const d = new Date(s.slice(0, 10) + "T00:00Z"); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${WD[d.getUTCDay()]} · ${s.slice(11, 16)}`; };
  const svcBy = id => SERVICES.find(s => s.id === id);
  const fail = msg => { throw new Error(msg); };

  /* --- данные --- */
  const me = { id: 1, first_name: "Гость", visits: 3, coins: 450, last_visit: addDays(today(), -16),
    cut: "crop", hair: "brown", room: "classic", frame: "brass", owned: [], tg: true };
  const clients = [me,
    { id: 2, first_name: "Андрей", last_name: "К", visits: 6, phone: "", tg: true },
    { id: 3, first_name: "Максим", visits: 0, phone: "", tg: true },
    { id: 4, first_name: "Илья", last_name: "С", visits: 2, phone: "+79000000004", tg: false },
    { id: 5, first_name: "Дмитрий", visits: 4, tg: true },
    { id: 6, first_name: "Артём", visits: 1, tg: true }];
  const back = [
    { id: 7, name: "Сергей П.", days: 23, canRemind: true, phone: "", remindedToday: false },
    { id: 8, name: "Олег", days: 26, canRemind: true, phone: "", remindedToday: false },
    { id: 9, name: "Никита В.", days: 31, canRemind: false, phone: "+79000000009", remindedToday: false },
    { id: 10, name: "Роман", days: 35, canRemind: true, phone: "", remindedToday: false }];
  let bookings = [], blocks = [], nextId = 100;
  const name = c => [c.first_name, c.last_name ? c.last_name + "." : ""].filter(Boolean).join(" ");
  const add = (cid, svc, start, status = "booked") => { const s = svcBy(svc); bookings.push({ id: nextId++, cid, service: s.name, price: s.price, minutes: s.minutes, start, status }); };
  // чужие записи на ближайшие рабочие дни — чтобы в записи были занятые слоты, а в кабинете было что смотреть
  (function seed(){
    const plan = [[2,"cut","10:00"],[4,"cut_beard","11:30"],[5,"fade","14:00"],[3,"beard","16:00"],[6,"kids","17:00"]];
    for (let i = 0, n = 0; i < HORIZON && n < 6; i++) {
      const date = addDays(today(), i); if (!WEEK[weekday(date)]) continue;
      plan.slice(0, i === 0 ? 5 : 3).forEach(([cid, svc, t], k) => add(cid, svc, `${date} ${t}`, i === 0 && toMin(t) < toMin(nowStamp().slice(11)) - 60 && k === 0 ? "done" : "booked"));
      n++;
    }
  })();

  const view = b => ({ id: b.id, service: b.service, price: b.price, start: b.start, when: human(b.start) });
  const upcoming = () => bookings.filter(b => b.cid === me.id && b.status === "booked" && b.start >= nowStamp()).sort((a, b) => a.start < b.start ? -1 : 1);
  const daysSince = c => c.last_visit ? Math.round((Date.parse(today() + "T00:00Z") - Date.parse(c.last_visit + "T00:00Z")) / 864e5) : null;
  const dayBlocks = date => blocks.filter(b => b.date === date);
  const isDayOff = date => dayBlocks(date).some(b => b.start === "00:00" && b.end === "24:00");
  const workDays = () => Array.from({ length: HORIZON }, (_, i) => { const date = addDays(today(), i); return { date, open: !!WEEK[weekday(date)] && !isDayOff(date) }; });
  function freeSlots(date, minutes, ignore = 0, lead = LEAD){
    const hours = WEEK[weekday(date)], t = today();
    if (!hours || date < t || date > addDays(t, HORIZON - 1)) return [];
    const [open, close] = hours.map(toMin);
    const busy = bookings.filter(b => b.status === "booked" && b.start.slice(0, 10) === date && b.id !== ignore)
      .map(b => { const s = toMin(b.start.slice(11)); return [s, s + b.minutes]; })
      .concat(dayBlocks(date).map(b => [toMin(b.start), toMin(b.end)]));
    const earliest = date === t ? toMin(nowStamp().slice(11)) + lead : -1, out = [];
    for (let s = open; s + minutes <= close; s += STEP) {
      if (s < earliest || busy.some(([a, b]) => s < b && s + minutes > a)) continue;
      out.push(fromMin(s));
    }
    return out;
  }
  const own = id => { const b = bookings.find(b => b.id === id && b.cid === me.id && b.status === "booked"); if (!b) fail("Запись не найдена"); return b; };
  const byId = id => { const b = bookings.find(b => b.id === id && b.status === "booked"); if (!b) fail("Запись не найдена"); return b; };

  const routes = [
    ["GET", /^\/me$/, () => ({
      name: me.first_name, visits: me.visits, coins: me.coins, days: daysSince(me), botVisits: me.visits, ownedRooms: me.owned.slice(),
      cut: me.cut, hair: me.hair, room: me.room, frame: me.frame, isBarber: true, upcoming: upcoming().map(view), shop: SHOP, loyalty: LOYALTY })],
    ["GET", /^\/catalog$/, () => ({ services: SERVICES.map(s => ({ ...s, dur: s.minutes >= 60 ? `${Math.floor(s.minutes / 60)} ч${s.minutes % 60 ? ` ${s.minutes % 60} мин` : ""}` : `${s.minutes} мин` })), days: workDays() })],
    ["GET", /^\/slots$/, (m, q) => { const s = svcBy(q.get("svc")); if (!s) fail("Неверный запрос"); return { slots: freeSlots(q.get("date"), s.minutes, +q.get("ignore") || 0) }; }],
    ["POST", /^\/bookings$/, (m, q, body) => {
      const s = svcBy(body.svc); if (!s) fail("Выбери услугу");
      if (upcoming().length) fail("У тебя уже есть запись — её можно перенести в профиле");
      if (!freeSlots(body.date, s.minutes).includes(body.time)) fail("Это время только что заняли, выбери другое");
      add(me.id, body.svc, `${body.date} ${body.time}`); return view(bookings[bookings.length - 1]); }],
    ["POST", /^\/bookings\/(\d+)\/cancel$/, m => { own(+m[1]).status = "cancelled"; return { ok: true }; }],
    ["POST", /^\/bookings\/(\d+)\/move$/, (m, q, body) => { const b = own(+m[1]);
      if (!freeSlots(body.date, b.minutes, b.id).includes(body.time)) fail("Это время только что заняли, выбери другое");
      b.start = `${body.date} ${body.time}`; return view(b); }],
    ["POST", /^\/me\/look$/, (m, q, body) => {
      for (const k of ["cut", "hair", "room", "frame"]) { const v = body[k]; if (v === undefined) continue;
        if (UNLOCK[k] && me.visits < (UNLOCK[k][v] ?? 0)) fail("Пока закрыто — нужно больше визитов");
        if (k === "room" && ROOM_PRICE[v] && !me.owned.includes(v)) fail("Этот фон нужно сначала купить");
        me[k] = v; }
      return { ok: true }; }],
    ["POST", /^\/me\/buy-room$/, (m, q, body) => { const p = ROOM_PRICE[body.room]; if (!p) fail("Такой фон не продаётся");
      if (!me.owned.includes(body.room)) { if (me.coins < p) fail(`Не хватает стрижкоинов: нужно ${p}, у тебя ${me.coins}`); me.coins -= p; me.owned.push(body.room); }
      me.room = body.room; return { coins: me.coins, ownedRooms: me.owned.slice() }; }],
    /* --- кабинет барбера --- */
    ["GET", /^\/barber\/day$/, (m, q) => { const date = q.get("date") || today();
      const rows = bookings.filter(b => b.start.slice(0, 10) === date && b.status !== "cancelled").sort((a, b) => a.start < b.start ? -1 : 1).map(b => {
        const c = clients.find(c => c.id === b.cid) || { first_name: b.name || "Клиент", visits: 0 };
        return { ...view(b), time: b.start.slice(11), status: b.status, name: b.name || name(c), firstVisit: !c.visits, phone: c.phone || b.phone || "", inBot: c.tg !== false && !b.name }; });
      const live = rows.filter(r => r.status !== "noshow");
      return { date, rows, count: live.length, revenue: live.reduce((a, r) => a + r.price, 0), returning: 64, blocks: dayBlocks(date), dayOff: isDayOff(date), hours: WEEK[weekday(date)] }; }],
    ["POST", /^\/barber\/bookings\/(\d+)\/(done|noshow)$/, m => { const b = byId(+m[1]);
      if (b.start.slice(0, 10) > today()) fail("Отметить можно только сегодняшнюю или прошедшую запись");
      b.status = m[2];
      if (m[2] === "done") { const c = clients.find(c => c.id === b.cid); if (c) { c.visits++; if (c === me) { me.coins += Math.round(b.price * LOYALTY.coinsPercent / 100); me.last_visit = b.start.slice(0, 10); } } }
      return { ok: true }; }],
    ["GET", /^\/barber\/back$/, () => ({ rows: back.map(r => ({ ...r })) })],
    ["POST", /^\/barber\/remind\/(\d+)$/, m => { const r = back.find(r => r.id === +m[1]); if (!r?.canRemind) fail("Клиент ещё не заходил в бота — написать ему нельзя"); r.remindedToday = true; return { ok: true }; }],
    ["GET", /^\/barber\/slots$/, (m, q) => { const s = svcBy(q.get("svc")); if (!s) fail("Неверный запрос"); return { slots: freeSlots(q.get("date"), s.minutes, 0, 0) }; }],
    ["POST", /^\/barber\/bookings$/, (m, q, body) => { const s = svcBy(body.svc); if (!s) fail("Выбери услугу");
      if (!String(body.name || "").trim() && !String(body.phone || "").trim()) fail("Укажи имя или телефон клиента");
      if (!freeSlots(body.date, s.minutes, 0, 0).includes(body.time)) fail("Это время уже занято");
      add(0, body.svc, `${body.date} ${body.time}`); const b = bookings[bookings.length - 1]; b.name = String(body.name || body.phone).trim(); b.phone = body.phone || "";
      return { ...view(b), inBot: false }; }],
    ["POST", /^\/barber\/bookings\/(\d+)\/cancel$/, m => { byId(+m[1]).status = "cancelled"; return { ok: true }; }],
    ["POST", /^\/barber\/blocks$/, (m, q, body) => { const start = body.start || "00:00", end = body.end || "24:00";
      if (toMin(end) <= toMin(start)) fail("Проверь время");
      const clash = bookings.find(b => b.status === "booked" && b.start.slice(0, 10) === body.date && toMin(b.start.slice(11)) < toMin(end) && toMin(b.start.slice(11)) + b.minutes > toMin(start));
      if (clash) fail(`В это время уже есть запись (${clash.start.slice(11)}). Сначала перенеси или отмени её`);
      blocks.push({ id: nextId++, date: body.date, start, end, note: body.note || "" }); return { ok: true }; }],
    ["POST", /^\/barber\/blocks\/(\d+)\/delete$/, m => { blocks = blocks.filter(b => b.id !== +m[1]); return { ok: true }; }],
    ["GET", /^\/barber\/stats$/, (m, q) => {
      const days = { week: 7, month: 30, all: 0 }[q.get("period")] ?? 7, to = today(), n = days || 90;
      const byDay = Array.from({ length: n }, (_, i) => { const date = addDays(to, i - n + 1), w = weekday(date);
        const k = WEEK[w] ? [0, 4, 3, 5, 6, 7, 8][w] : 0; return { date, n: k, sum: k * 1750 + (i % 3) * 600 * (k ? 1 : 0) }; });
      const visits = byDay.reduce((a, d) => a + d.n, 0), revenue = byDay.reduce((a, d) => a + d.sum, 0);
      const share = [["Стрижка", .45, 1700], ["Стрижка и моделирование бороды", .2, 2300], ["Fade (плавный переход)", .15, 1400], ["Моделирование бороды", .12, 1000], ["Детская стрижка", .08, 1400]];
      return { from: days ? addDays(to, -(days - 1)) : null, to, visits, revenue, noshow: Math.round(visits * .04), cancelled: Math.round(visits * .06),
        fresh: Math.round(visits * .3), back: visits - Math.round(visits * .3),
        services: share.map(([service, p, price]) => ({ service, n: Math.max(1, Math.round(visits * p)), sum: Math.max(1, Math.round(visits * p)) * price })),
        byDay: days ? byDay : [], clients: 214, inBot: 137, returning: 64 }; }],
  ];

  window.DEMO_API = async function(path, body){
    await new Promise(r => setTimeout(r, 120)); // как будто сходили на сервер
    const [p, qs] = path.split("?"), q = new URLSearchParams(qs || ""), method = body ? "POST" : "GET";
    for (const [mth, re, fn] of routes) { const m = p.match(re); if (mth === method && m) return JSON.parse(JSON.stringify(fn(m, q, body || {}))); }
    fail("В демо это не работает");
  };
  // для ползунка «Перемотка времени» на сайте: сколько дней прошло после стрижки
  window.setDemoDays = n => { me.last_visit = addDays(today(), -n); if (typeof loadMe === "function") loadMe().then(render); };
})();

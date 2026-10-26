/* Quiz Master Trainer SINW — PWA senza dipendenze. */
"use strict";
const CFG = window.QUIZ_CONFIG;
const TOPICS = {
  storia: "Storia e nascita SINW", vantaggi: "Vantaggi", attrezzatura: "Attrezzatura", tecnica: "Tecnica base",
  biomeccanica: "Biomeccanica e parametri SINW", andature: "Andature e coordinazione", sportive: "Tecniche sportive",
  riscaldamento: "Riscaldamento e defaticamento", pianificazione: "Pianificazione allenamento", didattica: "Didattica",
  errori: "Correzione degli errori", eserciziario: "Eserciziario", gruppi_sicurezza: "Gruppi specifici e sicurezza",
  eventi: "Eventi e circuiti", codice: "Codice deontologico", regolamento: "Regolamento", statuto: "Statuto",
  situazionali: "Casi pratici",
};
const LEVELS = { 1: "Base", 2: "Intermedio", 3: "Avanzato" };
const KEYS = "ABCD";

/* ---------- storage sicuro ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("mt_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("mt_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("mt_" + k); } catch {} },
};

/* ---------- stato ---------- */
const S = {
  user: store.get("user", null),          // {name, code}
  questions: store.get("questions", []),  // cache offline
  stats: store.get("stats", {}),          // {qid:{seen,correct,streak,open}}
  history: store.get("history", []),      // esami
  prefs: store.get("prefs", { topics: [], levels: [1, 2, 3], count: 20 }),
  adminPin: null,
  stack: [],
};
const saveStats = () => store.set("stats", S.stats);

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); }
function setTitle(t, back) { $("#title").textContent = t; $("#btnBack").hidden = !back; }
function updateNet() { $("#net").classList.toggle("off", !navigator.onLine); $("#net").title = navigator.onLine ? "Online" : "Offline"; }
addEventListener("online", updateNet); addEventListener("offline", updateNet);

/* ---------- Supabase RPC ---------- */
async function rpc(fn, args) {
  const r = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: CFG.supabaseKey, Authorization: `Bearer ${CFG.supabaseKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) { const e = new Error((data && data.message) || r.statusText); e.code = data && data.message; throw e; }
  return data;
}
async function loadQuestions(code) {
  const list = await rpc("quiz_get_questions", { p_code: code });
  S.questions = list; store.set("questions", list); store.set("questionsAt", Date.now());
  return list;
}

/* ---------- navigazione ---------- */
function go(fn, ...args) { S.stack.push([fn, args]); fn(...args); scrollTo(0, 0); }
function back() { stopTimer(); S.stack.pop(); const p = S.stack[S.stack.length - 1]; if (p) p[0](...p[1]); else home(); scrollTo(0, 0); }
$("#btnBack").onclick = () => {
  if (S.inProgress && !confirm("Vuoi interrompere? Le risposte date finora restano nelle statistiche.")) return;
  S.inProgress = false; back();
};

/* ---------- login ---------- */
function login() {
  S.stack = []; setTitle("Quiz Master Trainer", false);
  view.innerHTML = `
  <div class="card">
    <h2>Benvenuto 👋</h2>
    <p class="muted">Preparazione al corso Master Trainer della Scuola Italiana Nordic Walking. Inserisci il tuo nome e il codice del corso.</p>
    <form id="f">
      <label for="n">Nome</label><input id="n" type="text" autocomplete="name" required maxlength="60" value="${esc(S.user?.name || "")}">
      <label for="c">Codice corso</label><input id="c" type="password" autocomplete="off" required>
      <p class="small muted" id="err"></p>
      <button class="btn block" style="margin-top:12px">Entra</button>
    </form>
  </div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#n").value.trim(), code = $("#c").value.trim();
    const btn = e.submitter || $("#f button"); btn.disabled = true; $("#err").textContent = "Verifica in corso…";
    try {
      await loadQuestions(code);
      S.user = { name, code }; store.set("user", S.user); home();
    } catch (err) {
      $("#err").textContent = /codice_non_valido/.test(err.message) ? "Codice corso non valido." : "Connessione non riuscita. Riprova quando sei online.";
      btn.disabled = false;
    }
  };
}

/* ---------- home ---------- */
function topicStats() {
  const out = {};
  for (const q of S.questions) {
    const t = (out[q.topic] ||= { total: 0, seen: 0, correct: 0, answers: 0 });
    t.total++; const s = S.stats[q.id];
    if (s) { t.seen++; t.correct += s.correct; t.answers += s.seen; }
  }
  return out;
}
function home() {
  S.stack = [[home, []]]; S.inProgress = false; setTitle("Quiz Master Trainer", false);
  const ts = topicStats();
  const answered = Object.keys(S.stats).filter((id) => S.questions.some((q) => q.id === id)).length;
  const openErr = S.questions.filter((q) => S.stats[q.id]?.open).length;
  const tot = S.questions.length;
  const allAns = Object.values(ts).reduce((a, t) => a + t.answers, 0), allOk = Object.values(ts).reduce((a, t) => a + t.correct, 0);
  view.innerHTML = `
  <div class="card">
    <div class="row"><div><b>Ciao ${esc(S.user.name)}</b><div class="small muted">${answered}/${tot} domande viste · ${allAns ? Math.round((allOk / allAns) * 100) : 0}% risposte giuste</div></div>
    <span class="spacer"></span><button class="btn ghost" id="sync" title="Aggiorna domande">⟳ Aggiorna</button></div>
  </div>
  <div class="grid2">
    <button class="mode" data-m="train"><b>🎯 Allenamento</b><span>Scegli argomenti e livello, spiegazione dopo ogni risposta</span></button>
    <button class="mode" data-m="exam"><b>⏱️ Simulazione esame</b><span>${CFG.examQuestions} domande in ${CFG.examMinutes} minuti, si supera con 8/10</span></button>
    <button class="mode" data-m="review"><b>🔁 Ripasso errori</b><span>${openErr ? openErr + " domande da recuperare" : "Nessun errore da ripassare"}</span></button>
    <button class="mode" data-m="flash"><b>🃏 Flashcard</b><span>Domanda davanti, risposta e spiegazione dietro</span></button>
  </div>
  <h3>Andamento per argomento</h3>
  <div class="card">${Object.keys(TOPICS).filter((k) => ts[k]).map((k) => {
    const t = ts[k]; const p = t.answers ? Math.round((t.correct / t.answers) * 100) : null;
    const cls = p == null ? "" : p < 60 ? "lo" : p < 80 ? "mid" : "";
    return `<div class="topic-row"><span>${esc(TOPICS[k])} <span class="small muted">· ${t.seen}/${t.total}</span></span><span class="pct">${p == null ? "–" : p + "%"}</span><div class="bar ${cls}"><i style="width:${p ?? 0}%"></i></div></div>`;
  }).join("")}</div>
  ${S.history.length ? `<h3>Ultime simulazioni</h3><div class="card">${S.history.slice(-5).reverse().map((h) =>
    `<div class="row small"><span>${new Date(h.at).toLocaleDateString("it-IT")}</span><span class="spacer"></span><b class="${h.pct >= CFG.passThreshold * 100 ? "pass" : "fail"}">${h.ok}/${h.n} · ${h.pct}%</b></div>`).join("")}</div>` : ""}
  <div class="grid2" style="margin-top:12px">
    <button class="btn secondary" id="prop">✍️ Proponi una domanda</button>
    <button class="btn secondary" id="adm">🔐 Area amministratore</button>
  </div>
  <p class="small muted" style="text-align:center;margin-top:16px">v${CFG.appVersion} · <a href="#" id="logout" class="muted">Esci</a></p>`;
  view.querySelectorAll(".mode").forEach((b) => (b.onclick = () => ({ train: () => go(setup, "train"), exam: () => go(examIntro), review: () => go(startReview), flash: () => go(setup, "flash") }[b.dataset.m]())));
  $("#prop").onclick = () => go(proposeForm);
  $("#adm").onclick = () => go(adminLogin);
  $("#logout").onclick = (e) => { e.preventDefault(); if (confirm("Uscire? Le tue statistiche restano su questo dispositivo.")) { S.user = null; store.del("user"); login(); } };
  $("#sync").onclick = async () => {
    try { await loadQuestions(S.user.code); toast(`Domande aggiornate: ${S.questions.length}`); home(); }
    catch (e) { toast(/codice_non_valido/.test(e.message) ? "Il codice corso è cambiato: rientra." : "Sei offline: uso le domande salvate."); if (/codice_non_valido/.test(e.message)) login(); }
  };
}

/* ---------- impostazione allenamento / flashcard ---------- */
function setup(mode) {
  setTitle(mode === "train" ? "Allenamento" : "Flashcard", true);
  const p = S.prefs; const avail = Object.keys(TOPICS).filter((k) => S.questions.some((q) => q.topic === k));
  const sel = new Set(p.topics.length ? p.topics.filter((t) => avail.includes(t)) : avail);
  const lv = new Set(p.levels);
  view.innerHTML = `
  <div class="card">
    <h2>Argomenti</h2>
    <div class="row"><button class="btn ghost" id="all">Tutti</button><button class="btn ghost" id="none">Nessuno</button></div>
    <div class="chips" id="tp">${avail.map((k) => `<button class="chip" data-k="${k}" aria-pressed="${sel.has(k)}">${esc(TOPICS[k])}</button>`).join("")}</div>
    <h3>Livello</h3>
    <div class="chips" id="lv">${[1, 2, 3].map((l) => `<button class="chip" data-l="${l}" aria-pressed="${lv.has(l)}">${LEVELS[l]}</button>`).join("")}</div>
    <h3>Quante domande</h3>
    <div class="chips" id="ct">${[10, 20, 40, 0].map((n) => `<button class="chip" data-n="${n}" aria-pressed="${p.count === n}">${n || "Tutte"}</button>`).join("")}</div>
    <p class="small muted" id="avail"></p>
    <button class="btn block" id="go" style="margin-top:8px">Inizia</button>
  </div>`;
  const pool = () => S.questions.filter((q) => sel.has(q.topic) && lv.has(q.level));
  const refresh = () => { $("#avail").textContent = `${pool().length} domande disponibili con questi filtri`; $("#go").disabled = !pool().length; };
  $("#tp").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; const k = b.dataset.k; sel.has(k) ? sel.delete(k) : sel.add(k); b.setAttribute("aria-pressed", sel.has(k)); refresh(); };
  $("#lv").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; const l = +b.dataset.l; lv.has(l) ? lv.delete(l) : lv.add(l); b.setAttribute("aria-pressed", lv.has(l)); refresh(); };
  $("#ct").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; p.count = +b.dataset.n; $("#ct").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b)); };
  $("#all").onclick = () => { avail.forEach((k) => sel.add(k)); $("#tp").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", true)); refresh(); };
  $("#none").onclick = () => { sel.clear(); $("#tp").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", false)); refresh(); };
  $("#go").onclick = () => {
    S.prefs = { topics: [...sel], levels: [...lv], count: p.count }; store.set("prefs", S.prefs);
    // privilegia le domande mai viste o sbagliate
    let list = shuffle(pool()).sort((a, b) => weight(b) - weight(a));
    if (p.count) list = list.slice(0, p.count);
    list = shuffle(list);
    mode === "train" ? go(runQuiz, { list, mode: "train" }) : go(flash, list, 0, false);
  };
  refresh();
}
const weight = (q) => { const s = S.stats[q.id]; if (!s) return 2; if (s.open) return 3; return s.correct / s.seen < 1 ? 1 : 0; };

/* ---------- motore domande ---------- */
function record(q, ok, mode) {
  const s = (S.stats[q.id] ||= { seen: 0, correct: 0, streak: 0, open: false });
  s.seen++; if (ok) { s.correct++; s.streak++; } else { s.streak = 0; s.open = true; }
  if (s.open && s.streak >= 2) s.open = false;
  if (mode === "review" && ok && s.streak >= 2) s.open = false;
  saveStats();
}
function shuffledView(q) {
  const order = shuffle([0, 1, 2, 3]);
  return { order, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}
function qHeader(q) {
  return `<div class="qmeta"><span class="tag">${esc(TOPICS[q.topic] || q.topic)}</span><span class="tag l${q.level}">${LEVELS[q.level]}</span>${q.status === "da_validare" ? '<span class="tag val">da validare</span>' : ""}</div>`;
}
function runQuiz(st) {
  st.i ??= 0; st.ok ??= 0; st.answers ??= [];
  const exam = st.mode === "exam";
  setTitle(exam ? "Simulazione esame" : st.mode === "review" ? "Ripasso errori" : "Allenamento", true);
  S.inProgress = true;
  if (st.i >= st.list.length) return exam ? examResult(st) : endQuiz(st);
  const q = st.list[st.i]; const v = (st.cur ||= shuffledView(q));
  view.innerHTML = `
  <div class="progress"><span>Domanda ${st.i + 1} di ${st.list.length}</span>${exam ? `<span class="timer" id="tm"></span>` : `<span>✔ ${st.ok}</span>`}</div>
  <div class="bar" style="margin-bottom:14px"><i style="width:${(st.i / st.list.length) * 100}%"></i></div>
  <div class="card">
    ${qHeader(q)}
    <div class="question">${esc(q.question)}</div>
    <div class="opts">${v.options.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${KEYS[i]}</span><span>${esc(o)}</span></button>`).join("")}</div>
    <div id="fb"></div>
  </div>
  <div class="row end"><button class="btn ghost" id="rep">⚠️ Segnala un errore</button></div>
  <p class="small muted kbd-hint">Tastiera: A-D per rispondere, Invio per proseguire.</p>`;
  if (exam) tick(st);
  $("#rep").onclick = () => reportDialog(q);
  const choose = (i) => {
    if (st.done) return; st.done = true;
    const ok = i === v.answer; if (ok) st.ok++;
    st.answers.push({ q, chosen: v.order[i], ok });
    record(q, ok, st.mode);
    if (exam) { next(); return; }
    view.querySelectorAll(".opt").forEach((b) => { b.disabled = true; const bi = +b.dataset.i; if (bi === v.answer) b.classList.add("right"); else if (bi === i) b.classList.add("wrong"); });
    $("#fb").innerHTML = `<div class="explain ${ok ? "" : "ko"}"><div class="verdict">${ok ? "✅ Esatto!" : "❌ Non è corretto. Risposta giusta: " + KEYS[v.answer]}</div>${esc(q.explanation)}<div class="src">📖 ${esc(q.source)}</div></div>
      <button class="btn block" id="nx" style="margin-top:12px">${st.i + 1 < st.list.length ? "Avanti →" : "Vedi il risultato"}</button>`;
    $("#nx").onclick = next; $("#nx").focus();
  };
  const next = () => { st.i++; st.done = false; st.cur = null; runQuiz(st); scrollTo(0, 0); };
  view.querySelectorAll(".opt").forEach((b) => (b.onclick = () => choose(+b.dataset.i)));
  document.onkeydown = (e) => {
    if ($("#dlg").open) return;
    const k = e.key.toUpperCase();
    if (!st.done && KEYS.includes(k) && k.length === 1) choose(KEYS.indexOf(k));
    else if (st.done && e.key === "Enter" && $("#nx")) { e.preventDefault(); next(); }
  };
}
function endQuiz(st) {
  S.inProgress = false; document.onkeydown = null;
  const pct = Math.round((st.ok / st.list.length) * 100);
  view.innerHTML = `<div class="card" style="text-align:center"><h2>Fine sessione</h2><div class="big ${pct >= 80 ? "pass" : pct >= 60 ? "" : "fail"}">${pct}%</div><p>${st.ok} risposte giuste su ${st.list.length}</p></div>
  ${wrongList(st)}
  <div class="grid2"><button class="btn secondary" id="h">Torna alla home</button><button class="btn" id="again">Nuova sessione</button></div>`;
  $("#h").onclick = home; $("#again").onclick = () => { S.stack.pop(); const p = S.stack[S.stack.length - 1]; p ? p[0](...p[1]) : home(); };
}
function wrongList(st) {
  const w = st.answers.filter((a) => !a.ok);
  if (!w.length) return "";
  return `<details ${w.length <= 5 ? "open" : ""}><summary>Da rivedere (${w.length})</summary><div class="card">${w.map((a) => `<div class="list-item"><div style="font-weight:600">${esc(a.q.question)}</div>
    <div class="small" style="color:var(--ko)">Tua risposta: ${a.chosen == null ? "nessuna" : esc(a.q.options[a.chosen])}</div>
    <div class="small" style="color:var(--ok)">Corretta: ${esc(a.q.options[a.q.answer])}</div>
    <div class="small muted">${esc(a.q.explanation)} <i>(${esc(a.q.source)})</i></div></div>`).join("")}</div></details>`;
}

/* ---------- esame ---------- */
let timerH = null;
function stopTimer() { clearInterval(timerH); timerH = null; document.onkeydown = null; }
function examIntro() {
  setTitle("Simulazione esame", true);
  const pool = S.questions.filter((q) => q.status === "verificata");
  view.innerHTML = `<div class="card"><h2>Simulazione d'esame</h2>
    <p>${CFG.examQuestions} domande casuali da tutti gli argomenti, solo domande verificate.</p>
    <p>Hai <b>${CFG.examMinutes} minuti</b>. Le soluzioni compaiono alla fine.</p>
    <p>Per superarla serve almeno <b>${Math.round(CFG.passThreshold * 10)}/10</b>, cioè l'${Math.round(CFG.passThreshold * 100)}%, come per il test finale del Tecnico di 3° livello (Regolamento SINW, art. 16).</p>
    <button class="btn block" id="go" style="margin-top:12px">Inizia la simulazione</button></div>`;
  $("#go").onclick = () => {
    // un po' di tutto: estrazione bilanciata per argomento
    const byT = {}; shuffle(pool).forEach((q) => (byT[q.topic] ||= []).push(q));
    const list = []; const keys = shuffle(Object.keys(byT));
    while (list.length < Math.min(CFG.examQuestions, pool.length)) for (const k of keys) { if (byT[k].length && list.length < CFG.examQuestions) list.push(byT[k].pop()); }
    S.stack.pop(); go(runQuiz, { list: shuffle(list), mode: "exam", end: Date.now() + CFG.examMinutes * 60000 });
  };
}
function tick(st) {
  clearInterval(timerH);
  const draw = () => {
    const left = Math.max(0, st.end - Date.now()); const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    const el = $("#tm"); if (el) { el.textContent = `⏱ ${m}:${String(s).padStart(2, "0")}`; el.classList.toggle("low", left < 120000); }
    if (!left) { clearInterval(timerH); toast("Tempo scaduto!"); st.list.slice(st.i).forEach((q) => st.answers.push({ q, chosen: null, ok: false })); st.i = st.list.length; examResult(st); }
  };
  draw(); timerH = setInterval(draw, 1000);
}
function examResult(st) {
  stopTimer(); S.inProgress = false;
  const n = st.list.length, pct = Math.round((st.ok / n) * 100), pass = st.ok / n >= CFG.passThreshold;
  S.history.push({ at: Date.now(), n, ok: st.ok, pct }); store.set("history", S.history.slice(-50));
  const byT = {}; st.answers.forEach((a) => { const t = (byT[a.q.topic] ||= { n: 0, ok: 0 }); t.n++; if (a.ok) t.ok++; });
  view.innerHTML = `<div class="card" style="text-align:center"><h2>${pass ? "🎉 Superata!" : "Non ancora superata"}</h2>
    <div class="big ${pass ? "pass" : "fail"}">${st.ok}/${n}</div><p>${pct}% · voto ${(st.ok / n * 10).toFixed(1)}/10 · soglia ${Math.round(CFG.passThreshold * 10)}/10</p></div>
    <h3>Per argomento</h3><div class="card">${Object.entries(byT).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([k, t]) =>
      `<div class="row small"><span>${esc(TOPICS[k] || k)}</span><span class="spacer"></span><b>${t.ok}/${t.n}</b></div>`).join("")}</div>
    ${wrongList(st)}
    <div class="grid2"><button class="btn secondary" id="h">Torna alla home</button><button class="btn" id="again">Nuova simulazione</button></div>`;
  $("#h").onclick = home; $("#again").onclick = () => { S.stack = [[home, []]]; go(examIntro); };
}

/* ---------- ripasso errori ---------- */
function startReview() {
  const list = shuffle(S.questions.filter((q) => S.stats[q.id]?.open));
  if (!list.length) { setTitle("Ripasso errori", true); view.innerHTML = `<div class="card empty">🎉 Nessun errore da ripassare.<br>Una domanda sbagliata esce dal ripasso dopo 2 risposte giuste di fila.</div>`; return; }
  runQuiz({ list, mode: "review" });
}

/* ---------- flashcard ---------- */
function flash(list, i, back) {
  setTitle("Flashcard", true); document.onkeydown = null;
  const q = list[i];
  view.innerHTML = `<div class="progress"><span>Carta ${i + 1} di ${list.length}</span><span>${back ? "Risposta" : "Domanda"}</span></div>
  <div class="card flash" id="fc">${qHeader(q)}
    <div class="face-label">${back ? "Risposta" : "Domanda"}</div><div class="question">${esc(q.question)}</div>
    <div class="opts">${q.options.map((o, j) => `<div class="opt${back && j === q.answer ? " right" : ""}" style="cursor:inherit${back && j !== q.answer ? ";opacity:.55" : ""}"><span class="k">${KEYS[j]}</span><span>${esc(o)}</span></div>`).join("")}</div>
    ${back ? `<div class="explain"><div class="verdict">✅ Risposta giusta: ${KEYS[q.answer]}</div>${esc(q.explanation)}<div class="src">📖 ${esc(q.source)}</div></div>`
           : `<div class="small muted" style="margin-top:12px">Tocca la carta per vedere la risposta</div>`}
  </div>
  <div class="grid2"><button class="btn secondary" id="pv" ${i ? "" : "disabled"}>← Precedente</button><button class="btn" id="nx">${i + 1 < list.length ? "Successiva →" : "Fine"}</button></div>
  <div class="row end"><button class="btn ghost" id="rep">⚠️ Segnala un errore</button></div>`;
  $("#fc").onclick = () => flash(list, i, !back);
  $("#pv").onclick = () => flash(list, i - 1, false);
  $("#nx").onclick = () => (i + 1 < list.length ? flash(list, i + 1, false) : back_());
  $("#rep").onclick = () => reportDialog(q);
  document.onkeydown = (e) => { if ($("#dlg").open) return; if (e.key === " ") { e.preventDefault(); flash(list, i, !back); } if (e.key === "ArrowRight" && i + 1 < list.length) flash(list, i + 1, false); if (e.key === "ArrowLeft" && i) flash(list, i - 1, false); };
}
const back_ = () => back();

/* ---------- dialog generico ---------- */
function dialog(html, onSubmit) {
  const d = $("#dlg"), f = $("#dlgForm");
  f.innerHTML = html + `<div class="row end" style="margin-top:14px"><button class="btn secondary" value="cancel" formnovalidate>Annulla</button><button class="btn" value="ok">Invia</button></div>`;
  f.onsubmit = async (e) => {
    if (e.submitter?.value !== "ok") return;
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    try { await onSubmit(f); d.close(); } catch (err) { toast(err.message || "Errore"); } finally { btn.disabled = false; }
  };
  d.showModal();
}
function reportDialog(q) {
  dialog(`<h2>Segnala un errore</h2><p class="small muted">${esc(q.question)}</p>
    <label for="rm">Cosa non va?</label><textarea id="rm" required minlength="3" maxlength="2000" placeholder="Es. la risposta giusta secondo il manuale è un'altra, perché…"></textarea>`,
    async (f) => {
      if (!navigator.onLine) throw new Error("Sei offline: riprova con la connessione.");
      try { await rpc("quiz_submit_report", { p_code: S.user.code, p_author: S.user.name, p_question_id: q.id, p_message: $("#rm", f).value }); }
      catch (e) { throw new Error("Invio non riuscito: " + e.message); }
      toast("Grazie! Segnalazione inviata.");
    });
}

/* ---------- proponi domanda ---------- */
function questionForm(q = {}) {
  const o = q.options || ["", "", "", ""];
  return `
  <label for="q_t">Argomento</label><select id="q_t">${Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${q.topic === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
  <label for="q_l">Livello</label><select id="q_l">${[1, 2, 3].map((l) => `<option value="${l}" ${+q.level === l ? "selected" : ""}>${LEVELS[l]}</option>`).join("")}</select>
  <label for="q_q">Domanda</label><textarea id="q_q" required minlength="10">${esc(q.question || "")}</textarea>
  ${[0, 1, 2, 3].map((i) => `<label for="q_o${i}">Risposta ${KEYS[i]} <input type="radio" name="q_a" value="${i}" ${(q.answer ?? 0) === i ? "checked" : ""} aria-label="Risposta ${KEYS[i]} corretta"> <span class="small muted">giusta</span></label><input id="q_o${i}" type="text" required value="${esc(o[i])}">`).join("")}
  <label for="q_e">Spiegazione</label><textarea id="q_e" required>${esc(q.explanation || "")}</textarea>
  <label for="q_s">Fonte (documento e capitolo/articolo)</label><input id="q_s" type="text" required value="${esc(q.source || "")}" placeholder="Es. Manuale 2025, cap. 4.3">`;
}
function readQuestionForm(root) {
  return {
    topic: $("#q_t", root).value, level: +$("#q_l", root).value, question: $("#q_q", root).value.trim(),
    options: [0, 1, 2, 3].map((i) => $("#q_o" + i, root).value.trim()),
    answer: +root.querySelector("input[name=q_a]:checked").value,
    explanation: $("#q_e", root).value.trim(), source: $("#q_s", root).value.trim(),
  };
}
function proposeForm() {
  setTitle("Proponi una domanda", true);
  view.innerHTML = `<div class="card"><p class="muted small">La tua proposta arriva all'amministratore, che la controlla prima di inserirla nel quiz. Indica la fonte, così si verifica subito.</p>
    <form id="pf">${questionForm()}<button class="btn block" style="margin-top:14px">Invia proposta</button></form></div>`;
  $("#pf").onsubmit = async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    try {
      const p = readQuestionForm($("#pf"));
      if (new Set(p.options).size < 4) throw new Error("Le 4 risposte devono essere diverse.");
      await rpc("quiz_submit_proposal", { p_code: S.user.code, p_author: S.user.name, p_payload: p });
      toast("Proposta inviata, grazie!"); back();
    } catch (err) { toast(err.message.includes("Failed to fetch") ? "Sei offline: riprova più tardi." : err.message); btn.disabled = false; }
  };
}

/* ---------- amministratore ---------- */
function adminLogin() {
  setTitle("Area amministratore", true);
  if (S.adminPin) return adminPanel();
  view.innerHTML = `<div class="card"><form id="af"><label for="pin">PIN amministratore</label><input id="pin" type="password" inputmode="numeric" required autocomplete="off">
    <button class="btn block" style="margin-top:12px">Entra</button></form></div>`;
  $("#af").onsubmit = async (e) => {
    e.preventDefault();
    try { S.admin = await rpc("quiz_admin_list", { p_pin: $("#pin").value }); S.adminPin = $("#pin").value; adminPanel(); }
    catch (err) { toast(/pin_non_valido/.test(err.message) ? "PIN non valido" : "Connessione non riuscita"); }
  };
}
async function adminRefresh() { S.admin = await rpc("quiz_admin_list", { p_pin: S.adminPin }); await loadQuestions(S.user.code).catch(() => {}); }
function adminPanel(tab = "prop") {
  setTitle("Area amministratore", true);
  const A = S.admin;
  const tabs = { prop: `Proposte (${A.proposals.length})`, rep: `Segnalazioni (${A.reports.length})`, q: "Domande", set: "Impostazioni" };
  view.innerHTML = `<div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="chip" data-t="${k}" aria-pressed="${k === tab}">${v}</button>`).join("")}</div><div id="ap"></div>`;
  view.querySelector(".tabs").onclick = (e) => { const b = e.target.closest(".chip"); if (b) adminPanel(b.dataset.t); };
  const ap = $("#ap");
  if (tab === "prop") {
    ap.innerHTML = A.proposals.length ? A.proposals.map((p, i) => `<div class="card"><div class="small muted">${esc(p.author)} · ${new Date(p.created_at).toLocaleString("it-IT")}</div>
      <div class="question">${esc(p.payload.question)}</div>
      <ol type="A">${p.payload.options.map((o, j) => `<li ${j === p.payload.answer ? 'style="color:var(--ok);font-weight:600"' : ""}>${esc(o)}</li>`).join("")}</ol>
      <div class="small muted">${esc(p.payload.explanation)} <i>(${esc(p.payload.source)})</i></div>
      <div class="row end" style="margin-top:10px"><button class="btn secondary" data-rej="${i}">Scarta</button><button class="btn" data-ok="${i}">Rivedi e approva</button></div></div>`).join("") : `<div class="card empty">Nessuna proposta in attesa.</div>`;
    ap.onclick = async (e) => {
      const ok = e.target.dataset.ok, rej = e.target.dataset.rej;
      if (rej != null) { if (!confirm("Scartare questa proposta?")) return; await rpc("quiz_admin_set_status", { p_pin: S.adminPin, p_kind: "proposal", p_id: A.proposals[rej].id, p_status: "scartata" }); await adminRefresh(); adminPanel("prop"); }
      if (ok != null) { const p = A.proposals[ok]; editQuestion({ ...p.payload, status: "verificata", origin: "proposta:" + p.author }, async () => rpc("quiz_admin_set_status", { p_pin: S.adminPin, p_kind: "proposal", p_id: p.id, p_status: "approvata" }), "prop"); }
    };
  } else if (tab === "rep") {
    ap.innerHTML = A.reports.length ? A.reports.map((r, i) => `<div class="card"><div class="small muted">${esc(r.author)} · ${new Date(r.created_at).toLocaleString("it-IT")}</div>
      <div style="font-weight:600;margin:6px 0">${esc(r.question)}</div><div class="explain ko">${esc(r.message)}</div>
      <div class="row end" style="margin-top:10px"><button class="btn secondary" data-close="${i}">Chiudi</button><button class="btn" data-edit="${i}">Correggi domanda</button></div></div>`).join("") : `<div class="card empty">Nessuna segnalazione aperta.</div>`;
    ap.onclick = async (e) => {
      const c = e.target.dataset.close, ed = e.target.dataset.edit;
      const closeIt = (r) => rpc("quiz_admin_set_status", { p_pin: S.adminPin, p_kind: "report", p_id: r.id, p_status: "chiusa" });
      if (c != null) { await closeIt(A.reports[c]); await adminRefresh(); adminPanel("rep"); }
      if (ed != null) { const r = A.reports[ed]; const q = S.questions.find((x) => x.id === r.question_id) || A.inactive.find((x) => x.id === r.question_id); if (q) editQuestion(q, () => closeIt(r), "rep"); }
    };
  } else if (tab === "q") {
    ap.innerHTML = `<div class="card"><div class="row"><input type="text" id="qs" placeholder="Cerca nel testo…" style="flex:1"><button class="btn" id="nq">+ Nuova</button></div>
      <div class="chips" style="margin-top:10px"><button class="chip" id="fv" aria-pressed="false">Solo da validare</button><button class="chip" id="fi" aria-pressed="false">Disattivate (${A.inactive.length})</button></div></div><div id="ql"></div>`;
    let onlyVal = false, inact = false;
    const draw = () => {
      const term = $("#qs").value.toLowerCase();
      const src = inact ? A.inactive : S.questions;
      const list = src.filter((q) => (!onlyVal || q.status === "da_validare") && (!term || (q.question + q.options.join(" ")).toLowerCase().includes(term))).slice(0, 60);
      $("#ql").innerHTML = `<p class="small muted">${list.length} risultati${list.length === 60 ? " (primi 60)" : ""}</p>` + list.map((q) => `<div class="card" data-id="${q.id}" style="cursor:pointer">${qHeader(q)}<div>${esc(q.question)}</div></div>`).join("");
    };
    $("#qs").oninput = draw;
    $("#fv").onclick = (e) => { onlyVal = !onlyVal; e.target.setAttribute("aria-pressed", onlyVal); draw(); };
    $("#fi").onclick = (e) => { inact = !inact; e.target.setAttribute("aria-pressed", inact); draw(); };
    $("#nq").onclick = () => editQuestion({ status: "verificata" }, null, "q");
    $("#ql").onclick = (e) => { const c = e.target.closest("[data-id]"); if (!c) return; const q = (inact ? A.inactive : S.questions).find((x) => x.id === c.dataset.id); editQuestion(q, null, "q"); };
    draw();
  } else {
    ap.innerHTML = `<div class="card"><h2>Codice corso</h2><p class="small muted">Da comunicare ai corsisti. Cambiandolo, chi è già dentro dovrà reinserirlo.</p>
      <div class="row"><input type="text" id="cc" placeholder="Nuovo codice corso" style="flex:1"><button class="btn" id="scc">Salva</button></div></div>
      <div class="card"><h2>PIN amministratore</h2><div class="row"><input type="password" id="np" placeholder="Nuovo PIN" style="flex:1"><button class="btn" id="snp">Salva</button></div></div>
      <div class="card"><button class="btn secondary block" id="lo">Esci dall'area amministratore</button></div>`;
    $("#scc").onclick = async () => { const v = $("#cc").value.trim(); if (v.length < 4) return toast("Almeno 4 caratteri"); await rpc("quiz_admin_set_code", { p_pin: S.adminPin, p_key: "course_code", p_new: v }); S.user.code = v; store.set("user", S.user); toast("Codice corso aggiornato"); };
    $("#snp").onclick = async () => { const v = $("#np").value.trim(); if (v.length < 4) return toast("Almeno 4 caratteri"); await rpc("quiz_admin_set_code", { p_pin: S.adminPin, p_key: "admin_pin", p_new: v }); S.adminPin = v; toast("PIN aggiornato"); };
    $("#lo").onclick = () => { S.adminPin = null; S.admin = null; home(); };
  }
}
function editQuestion(q, after, tabBack) {
  setTitle(q.id ? "Modifica domanda" : "Nuova domanda", true);
  view.innerHTML = `<div class="card"><form id="ef">${questionForm(q)}
    <label><input type="checkbox" id="q_sit" ${q.situational ? "checked" : ""}> Caso pratico (situazionale)</label>
    <label for="q_st">Stato</label><select id="q_st"><option value="verificata" ${q.status !== "da_validare" ? "selected" : ""}>Verificata</option><option value="da_validare" ${q.status === "da_validare" ? "selected" : ""}>Da validare</option></select>
    <label><input type="checkbox" id="q_ac" ${q.active === false ? "" : "checked"}> Attiva (visibile nel quiz)</label>
    <div class="grid2" style="margin-top:14px"><button type="button" class="btn secondary" id="cx">Annulla</button><button class="btn">Salva</button></div></form></div>`;
  $("#cx").onclick = () => adminPanel(tabBack);
  $("#ef").onsubmit = async (e) => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    try {
      const d = { ...readQuestionForm($("#ef")), id: q.id || "", origin: q.origin, situational: $("#q_sit").checked, status: $("#q_st").value, active: $("#q_ac").checked };
      if (new Set(d.options).size < 4) throw new Error("Le 4 risposte devono essere diverse.");
      await rpc("quiz_admin_upsert_question", { p_pin: S.adminPin, p_q: d });
      if (after) await after();
      await adminRefresh(); toast("Salvato"); adminPanel(tabBack);
    } catch (err) { toast(err.message); btn.disabled = false; }
  };
}

/* ---------- avvio ---------- */
updateNet();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
if (S.user && S.questions.length) { home(); if (navigator.onLine) loadQuestions(S.user.code).then(() => { if (S.stack.length <= 1) home(); }).catch((e) => { if (/codice_non_valido/.test(e.message)) login(); }); }
else login();

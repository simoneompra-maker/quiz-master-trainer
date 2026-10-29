/* Quiz Master Trainer — PWA senza dipendenze. */
"use strict";
const CFG = window.QUIZ_CONFIG;
// Novità mostrate una volta in home dopo l'aggiornamento: aggiungere qui una voce per ogni nuova versione.
const NOVITA = {
  "1.5.0": [
    "Si entra con il PIN personale: protegge i tuoi risultati, nessuno può usare il tuo nome.",
    "L'app si aggiorna da sola quando la apri.",
  ],
  "1.4.0": ["🎙️ Quiz a voce e Simulazione a voce.", "📊 I miei risultati: lo storico di quiz e simulazioni."],
};
// Documenti su cui si basano le domande: aggiornare qui quando esce una nuova versione.
const FONTI = [
  ["Manuale tecnico 2025", "rev. giugno 2025"],
  ["Eserciziario", "rev. ottobre 2023"],
  ["Codice deontologico dei Tecnici", "aggiornato al 01/04/2022"],
  ["Regolamento generale", "aggiornato al 15/04/2025"],
  ["Statuto", "approvato il 13/12/2023"],
];
const TOPICS = {
  storia: "Storia e nascita", vantaggi: "Vantaggi", attrezzatura: "Attrezzatura", tecnica: "Tecnica base",
  biomeccanica: "Biomeccanica e parametri tecnici", andature: "Andature e coordinazione", sportive: "Tecniche sportive",
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
  token: store.get("token", null),        // accesso allo storico spiegazioni (PIN personale)
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
// Messaggi comprensibili per gli errori che arrivano dal database.
const ERRORS = {
  codice_non_valido: "Il codice corso è cambiato: esci e rientra con quello nuovo.",
  sessione_non_valida: "Accesso scaduto: inserisci di nuovo il PIN.",
  pin_formato: "Il PIN deve avere da 4 a 8 cifre.",
  pin_uguale_iniziale: "Il PIN personale deve essere diverso dal PIN iniziale.",
  cambia_pin_prima: "Prima scegli il tuo PIN personale.",
  nome_non_valido: "Nome non valido: esci e rientra con nome e cognome.",
  testo_troppo_lungo: "Il testo è troppo lungo.",
  pin_non_valido: "PIN errato.",
  valore_non_valido: "Valore non valido.",
  modalita_non_valida: "Modalità di quiz non riconosciuta.",
  formato_non_supportato: "Formato audio non supportato: usa MP3, M4A, WAV, OGG, AAC o WEBM.",
  file_troppo_grande: "File oltre 50 MB: convertilo in MP3 e riprova.",
  file_non_caricato: "Il file non risulta caricato: riprova.",
  dati_non_validi: "Dati non validi: controlla i campi.",
  non_trovato: "Podcast non trovato (forse è già stato eliminato).",
  errore_server: "Errore del server: riprova tra poco.",
};
function errMsg(e) {
  const m = String(e?.message || e || "");
  if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(m)) return "Connessione non riuscita: controlla di essere online.";
  for (const k in ERRORS) if (m.includes(k)) return ERRORS[k];
  return "Errore: " + m;
}
// Funzione Supabase dei podcast: corpo JSON con "action"; gli errori arrivano come {error: "..."}.
async function podcastApi(body) {
  const r = await fetch(`${CFG.supabaseUrl}/functions/v1/quiz-podcasts`, {
    method: "POST",
    headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error((data && data.error) || "errore_server");
  return data;
}
async function loadQuestions(code) {
  const list = await rpc("quiz_get_questions", { p_code: code });
  S.questions = list; store.set("questions", list); store.set("questionsAt", Date.now());
  return list;
}

/* ---------- navigazione ---------- */
// Il quiz a voce registra qui come fermare lettura e microfono quando si cambia schermata.
let voiceCleanup = null;
function stopVoice() { const f = voiceCleanup; voiceCleanup = null; f?.(); }
function go(fn, ...args) { stopVoice(); S.stack.push([fn, args]); fn(...args); scrollTo(0, 0); }
function back() { stopVoice(); stopTimer(); S.stack.pop(); const p = S.stack[S.stack.length - 1]; if (p) p[0](...p[1]); else home(); scrollTo(0, 0); }
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
    <p class="muted">Preparazione al corso Master Trainer. Inserisci il tuo nome e il codice del corso.</p>
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
      if (S.token && S.user?.name.toLowerCase() !== name.toLowerCase()) leaveHistory(); // lo storico è di un'altra persona
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
  stopVoice(); stopTimer();
  if (S.reloadPending) return location.reload(); // nuova versione scaricata mentre era in corso un quiz
  if (!S.token && navigator.onLine) return pinGate(); // PIN obbligatorio (senza rete si continua e lo si chiede dopo)
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
  ${S.updatedFrom && NOVITA[CFG.appVersion] ? `<div class="card news" id="news"><b>✨ App aggiornata alla versione ${esc(CFG.appVersion)}</b>
    <ul>${NOVITA[CFG.appVersion].map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <div class="row end"><button class="btn secondary" id="newsOk">Ho capito</button></div></div>` : ""}
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
  <button class="btn secondary block" id="pods" style="margin-top:12px">🎧 Ascolta i podcast</button>
  <button class="btn secondary block" id="hist" style="margin-top:10px">📈 Storico spiegazioni</button>
  ${S.token ? `<button class="btn secondary block" id="res" style="margin-top:10px">📊 I miei risultati</button>` : ""}
  <div class="grid2" style="margin-top:10px">
    <button class="btn secondary" id="prop">✍️ Proponi una domanda</button>
    <button class="btn secondary" id="fonti">📚 Fonti</button>
  </div>
  <button class="btn secondary block" id="adm" style="margin-top:10px">🔐 Area amministratore</button>
  <p class="small muted" style="text-align:center;margin-top:16px">v${CFG.appVersion} · <a href="#" id="chpin" class="muted">Cambia PIN</a> · <a href="#" id="logout" class="muted">Esci</a></p>`;
  view.querySelectorAll(".mode").forEach((b) => (b.onclick = () => ({ train: () => go(setup, "train"), exam: () => go(examIntro), review: () => go(startReview), flash: () => go(setup, "flash") }[b.dataset.m]())));
  $("#prop").onclick = () => go(proposeForm);
  if ($("#newsOk")) $("#newsOk").onclick = () => { S.updatedFrom = null; $("#news").remove(); };
  $("#fonti").onclick = () => go(fontiPage);
  $("#pods").onclick = () => go(podcastPage);
  $("#hist").onclick = () => go(historyPage);
  if ($("#res")) $("#res").onclick = () => go(resultsPage, "all");
  $("#adm").onclick = () => go(adminLogin);
  $("#chpin").onclick = (e) => { e.preventDefault(); changePin(); };
  $("#logout").onclick = (e) => { e.preventDefault(); if (confirm("Uscire? Le tue statistiche restano su questo dispositivo.")) { leaveHistory(); S.user = null; S.updatedFrom = null; store.del("user"); login(); } };
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
  // modalità di allenamento: quiz | voice (Spiega a voce) | quizvoce (Quiz a voce)
  let tmode = mode === "train" && ["voice", "quizvoce"].includes(p.trainMode) ? p.trainMode : "quiz";
  view.innerHTML = `
  <div class="card">
    <h2>Argomenti</h2>
    <div class="row"><button class="btn ghost" id="all">Tutti</button><button class="btn ghost" id="none">Nessuno</button></div>
    <div class="chips" id="tp">${avail.map((k) => `<button class="chip" data-k="${k}" aria-pressed="${sel.has(k)}">${esc(TOPICS[k])}</button>`).join("")}</div>
    <h3>Livello</h3>
    <div class="chips" id="lv">${[1, 2, 3].map((l) => `<button class="chip" data-l="${l}" aria-pressed="${lv.has(l)}">${LEVELS[l]}</button>`).join("")}</div>
    ${mode === "train" ? `<h3>Come vuoi allenarti</h3>
    <div class="tmodes" id="tm">${[["quiz", "📝 Rispondi ai quiz"], ["voice", "🎙️ Spiega a voce"], ["quizvoce", "🎙️ Quiz a voce"]].map(([k, v]) => `<button class="chip" data-tm="${k}" aria-pressed="${tmode === k}">${v}</button>`).join("")}</div>` : ""}
    <div id="ctBox"><h3>Quante domande</h3>
    <div class="chips" id="ct">${[10, 20, 40, 0].map((n) => `<button class="chip" data-n="${n}" aria-pressed="${p.count === n}">${n || "Tutte"}</button>`).join("")}</div></div>
    <p class="small muted" id="avail"></p>
    <button class="btn block" id="go" style="margin-top:8px">Inizia</button>
  </div>`;
  const pool = () => S.questions.filter((q) => sel.has(q.topic) && lv.has(q.level));
  const refresh = () => {
    $("#ctBox").hidden = tmode === "voice"; $("#go").textContent = tmode === "voice" ? "Dammi un compito" : "Inizia";
    $("#avail").textContent = `${pool().length} domande disponibili con questi filtri`; $("#go").disabled = !pool().length;
  };
  if (mode === "train") $("#tm").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; tmode = b.dataset.tm; $("#tm").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b)); refresh(); };
  $("#tp").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; const k = b.dataset.k; sel.has(k) ? sel.delete(k) : sel.add(k); b.setAttribute("aria-pressed", sel.has(k)); refresh(); };
  $("#lv").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; const l = +b.dataset.l; lv.has(l) ? lv.delete(l) : lv.add(l); b.setAttribute("aria-pressed", lv.has(l)); refresh(); };
  $("#ct").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; p.count = +b.dataset.n; $("#ct").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b)); };
  $("#all").onclick = () => { avail.forEach((k) => sel.add(k)); $("#tp").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", true)); refresh(); };
  $("#none").onclick = () => { sel.clear(); $("#tp").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", false)); refresh(); };
  $("#go").onclick = () => {
    S.prefs = { ...p, topics: [...sel], levels: [...lv], count: p.count, trainMode: mode === "train" ? tmode : p.trainMode }; store.set("prefs", S.prefs);
    if (tmode === "voice") return go(voiceTask, pool(), [...sel]);
    // argomento da salvare nei risultati: "tutti", la chiave se è uno solo, altrimenti l'elenco
    const keys = [...sel], topic = keys.length === avail.length ? "tutti" : keys.join(",").length <= 60 ? keys.join(",") : "vari";
    // privilegia le domande mai viste o sbagliate
    let list = shuffle(pool()).sort((a, b) => weight(b) - weight(a));
    if (p.count) list = list.slice(0, p.count);
    list = shuffle(list);
    if (mode !== "train") return go(flash, list, 0, false);
    tmode === "quizvoce" ? go(voiceQuizStart, { list, mode: "quiz_voce", topic }) : go(runQuiz, { list, mode: "train", topic });
  };
  refresh();
}
const weight = (q) => { const s = S.stats[q.id]; if (!s) return 2; if (s.open) return 3; return s.correct / s.seen < 1 ? 1 : 0; };

/* ---------- spiega a voce ---------- */
// I tre fondamentali dell'Eserciziario: le fonti delle domande citano "primo/secondo/terzo fondamentale".
const FONDAMENTALI = [
  { re: /primo fondamentale/i, tema: "la Preparazione (piede e dinamica del cammino)" },
  { re: /secondo fondamentale/i, tema: "l'Inserimento del bastoncino (bastoncino e arti superiori)" },
  { re: /terzo fondamentale/i, tema: "l'Utilizzo del bastoncino (carico, spinta, recupero)" },
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// 6-10 punti chiave: prima i gruppi indicati in ordine, dentro ogni gruppo prima le domande verificate; niente doppioni.
function keyPoints(groups, max = 8) {
  const out = [], seen = new Set();
  for (const g of groups) {
    const sorted = shuffle(g).sort((a, b) => (b.status === "verificata") - (a.status === "verificata"));
    for (const q of sorted) {
      const k = (q.explanation || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(q);
      if (out.length >= max) return out;
    }
  }
  return out;
}
function makeVoiceTask(pool, topics) {
  const byTopic = (ts) => S.questions.filter((q) => ts.includes(q.topic));
  const kinds = [];
  const sit = pool.filter((q) => q.situational);
  if (sit.length) kinds.push("sit");
  const es = pool.filter((q) => q.topic === "eserciziario");
  const fonds = FONDAMENTALI.filter((f) => es.some((q) => f.re.test(q.source)));
  if (es.length) kinds.push("es");
  const plain = [...new Set(pool.filter((q) => !q.situational && q.topic !== "eserciziario").map((q) => q.topic))];
  if (plain.length) kinds.push("topic");
  const kind = pick(kinds);
  if (kind === "sit") {
    const q = pick(sit), txt = q.question.trim();
    return {
      topic: q.topic,
      title: `Caso pratico: ${txt}${/[.?!]$/.test(txt) ? "" : "."} Rispondi spiegando come interverresti e perché.`,
      points: keyPoints([[q], byTopic(["errori", "didattica", "eserciziario"])]),
    };
  }
  if (kind === "es") {
    const all = byTopic(["eserciziario"]);
    if (fonds.length) {
      const f = pick(fonds);
      return { topic: "eserciziario", title: `Descrivi agli allievi un esercizio per: ${f.tema}, con obiettivo ed esecuzione.`, points: keyPoints([all.filter((q) => f.re.test(q.source)), all]) };
    }
    return { topic: "eserciziario", title: `Descrivi agli allievi un esercizio per: ${TOPICS.eserciziario}, con obiettivo ed esecuzione.`, points: keyPoints([all]) };
  }
  const t = pick(plain), own = byTopic([t]);
  return { topic: t, title: `Spiega agli allievi: ${TOPICS[t] || t}.`, points: keyPoints(own.length >= 6 ? [own] : [own, byTopic(topics)]) };
}
function voiceMessage(task) {
  return `Sei un esaminatore esperto del corso Master Trainer di Nordic Walking.
Ti spiegherò a voce, come davanti a un gruppo di allievi: ${task.title}
Ascoltami senza interrompermi e non rivelarmi i punti chiave prima che io dica 'ho finito'.
Poi dammi un feedback in quattro punti:
1) Contenuto: cosa ho detto bene, cosa ho dimenticato, cosa è impreciso rispetto ai punti chiave. Considera solo i punti pertinenti al compito: non togliere punti per argomenti non richiesti.
2) Chiarezza e didattica: ordine logico, esempi; se le immagini o gli esercizi che uso sono in linea con quelli indicati nei punti chiave, dimmelo; se ne esiste già uno ufficiale diverso, citalo.
3) Linguaggio: elenca ogni intercalare con il numero di volte (es. quindi ×9, ehm ×5, diciamo ×4, cioè ×3, praticamente ×2), poi ripetizioni e frasi troppo lunghe.
4) Un voto da 1 a 10 e un solo consiglio pratico per la prossima prova.
Poi chiedimi se voglio riprovare.
PUNTI CHIAVE:
${task.points.map((q) => `- ${q.explanation.trim()} (fonte: ${q.source})`).join("\n")}`;
}
// Voto nel feedback dell'IA ("Voto: 8,5 / 10", "8.5/10", "Voto finale: 7"): vale l'ultimo trovato.
function parseScore(t) {
  const num = "(\\d{1,2}(?:[.,]\\d{1,2})?)";
  let m, last = null;
  for (const re of [new RegExp(num + "\\s*/\\s*10(?![\\d.,]*\\d)", "g"), new RegExp("\\bvoto(?:\\s+finale)?\\s*[:=]?\\s*\\**\\s*" + num + "(?![\\d/])", "gi")]) {
    while ((m = re.exec(t))) last = m[1];
    if (last != null) break;
  }
  if (last == null) return null;
  const n = Math.round(+last.replace(",", ".") * 2) / 2;
  return n >= 1 && n <= 10 ? n : null;
}
function voiceTask(pool, topics) {
  setTitle("Spiega a voce", true); document.onkeydown = null;
  const task = makeVoiceTask(pool, topics), msg = voiceMessage(task);
  view.innerHTML = `<div class="card">
    <div class="face-label">Il tuo compito</div>
    <div class="task">${esc(task.title)}</div>
    <div class="grid2"><button class="btn" id="cp">📋 Copia messaggio</button><button class="btn secondary" id="again">🔄 Altro compito</button></div>
    <div id="fallback"></div>
    <p class="small muted" style="margin-top:14px">Incolla il messaggio in Claude, Gemini o ChatGPT, avvia la modalità vocale e spiega. Quando hai finito di' 'ho finito'.</p>
    <div class="row">${[["https://claude.ai/new", "Claude"], ["https://gemini.google.com/app", "Gemini"], ["https://chatgpt.com", "ChatGPT"]].map(([u, n]) => `<a class="btn ghost" href="${u}" target="_blank" rel="noopener">${n} ↗</a>`).join("")}</div>
    <p class="small muted">${task.points.length} punti chiave inclusi nel messaggio (non mostrati qui, così non li leggi prima).</p>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Salva il feedback</h3>
    <p class="small muted">Incolla la risposta dell'IA: argomento e compito si aggiungono da soli e la trovi nello storico spiegazioni.</p>
    <label for="fbText">Feedback ricevuto</label><textarea id="fbText" rows="6" maxlength="20000" placeholder="Incolla qui la risposta dell'IA"></textarea>
    <label for="fbScore">Voto (facoltativo)</label><input id="fbScore" type="number" min="1" max="10" step="0.5" inputmode="decimal" placeholder="1-10" style="max-width:140px">
    <p class="small" id="fbInfo"></p>
    <button class="btn block" id="fbSave">Salva</button>
  </div>`;
  let autoScore = true; // il voto letto dal testo non sovrascrive quello scritto a mano
  $("#fbScore").oninput = () => { autoScore = !$("#fbScore").value; };
  $("#fbText").oninput = () => {
    const s = parseScore($("#fbText").value);
    if (s != null && autoScore) { $("#fbScore").value = s; $("#fbInfo").textContent = `Voto ${String(s).replace(".", ",")} letto dal testo.`; }
  };
  $("#fbSave").onclick = async () => {
    const text = $("#fbText").value.trim(), sc = $("#fbScore"), info = $("#fbInfo");
    const score = sc.value === "" ? null : sc.valueAsNumber;
    info.className = "small dlg-err";
    if (!text && score == null) { info.textContent = "Incolla il feedback o inserisci un voto."; return; }
    if (score != null && (!(score >= 1 && score <= 10) || !sc.checkValidity())) { info.textContent = "Il voto va da 1 a 10, a passi di 0,5."; return; }
    if (!navigator.onLine) { info.textContent = "Serve la connessione per salvare il feedback."; return; }
    const btn = $("#fbSave"); btn.disabled = true; info.textContent = "";
    try {
      await userRpc("quiz_feedback_add", { p_topic: task.topic, p_task: task.title, p_score: score, p_feedback: text });
      sc.value = ""; $("#fbText").value = ""; autoScore = true;
      info.className = "small saved"; info.textContent = "✓ Feedback salvato"; toast("Feedback salvato");
    } catch (e) { if (e.message !== CANCELLED) info.textContent = e.message; }
    finally { btn.disabled = false; }
  };
  const showFallback = () => {
    $("#fallback").innerHTML = `<p class="small muted" style="margin-top:12px">Copia non riuscita: seleziona il testo qui sotto e copialo.</p><textarea id="msg" readonly rows="10">${esc(msg)}</textarea>`;
    const ta = $("#msg"); ta.focus(); ta.select();
  };
  $("#cp").onclick = async () => {
    try { await navigator.clipboard.writeText(msg); toast("Messaggio copiato ✓"); } catch { showFallback(); }
  };
  $("#again").onclick = () => { voiceTask(pool, topics); scrollTo(0, 0); };
}

/* ---------- motore domande ---------- */
function record(q, ok, mode) {
  const s = (S.stats[q.id] ||= { seen: 0, correct: 0, streak: 0, open: false });
  s.seen++; if (ok) { s.correct++; s.streak++; } else { s.streak = 0; s.open = true; }
  if (s.open && s.streak >= 2) s.open = false;
  if (mode === "review" && ok && s.streak >= 2) s.open = false;
  saveStats();
}
function shuffledView(q) {
  const order = shuffle(q.options.map((_, i) => i));
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
  <div class="bar neutral" style="margin-bottom:14px"><i style="width:${(st.i / st.list.length) * 100}%"></i></div>
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
  stopVoice(); S.inProgress = false; document.onkeydown = null;
  const n = st.answers.length, pct = Math.round((st.ok / n) * 100); // interrotto con "stop": contano le domande affrontate
  setTitle(st.mode === "quiz_voce" ? "Quiz a voce" : st.mode === "review" ? "Ripasso errori" : "Allenamento", true);
  view.innerHTML = `<div class="card" style="text-align:center"><h2>${st.stopped ? "Quiz interrotto" : "Fine sessione"}</h2><div class="big ${pct >= 80 ? "pass" : pct >= 60 ? "" : "fail"}">${pct}%</div><p>${st.ok} risposte giuste su ${n}${st.stopped ? ` (${n} di ${st.list.length} domande affrontate)` : ""}</p>
  <p class="small muted" id="saveNote"></p></div>
  ${wrongList(st)}
  <div class="grid2"><button class="btn secondary" id="h">Torna alla home</button><button class="btn" id="again">Nuova sessione</button></div>`;
  $("#h").onclick = home; $("#again").onclick = () => { S.stack.pop(); const p = S.stack[S.stack.length - 1]; p ? p[0](...p[1]) : home(); };
  saveResult(st);
}
/* ---------- risultati salvati (solo con l'accesso allo storico) ---------- */
const RESULT_MODES = { train: "quiz", exam: "simulazione", quiz_voce: "quiz_voce", simulazione_voce: "simulazione_voce" };
async function saveResult(st) {
  const mode = RESULT_MODES[st.mode], n = st.answers.length;
  if (!mode || !n || st.saved) return; // ripasso e flashcard non si salvano
  const note = (html) => { const el = $("#saveNote"); if (el) el.innerHTML = html; };
  if (!S.token) {
    note(`Accedi con il tuo PIN per salvare i risultati nello storico. <a href="#" id="saveLogin">Accedi e salva</a>`);
    $("#saveLogin").onclick = async (e) => { e.preventDefault(); if (await requireToken()) saveResult(st); };
    return;
  }
  note("Salvataggio del risultato…");
  const exam = mode === "simulazione" || mode === "simulazione_voce";
  try {
    await rpc("quiz_result_add", {
      p_token: S.token, p_mode: mode, p_topic: exam ? "tutti" : st.topic || "tutti", p_total: n, p_correct: st.ok,
      p_passed: exam ? st.ok / n >= CFG.passThreshold : null,
      p_wrong_ids: [...new Set(st.answers.filter((a) => !a.ok).map((a) => a.q.id))],
    });
    st.saved = true; note(`<span class="saved">✓ Risultato salvato</span> in “I miei risultati”.`);
  } catch (e) {
    if (/sessione_non_valida|cambia_pin_prima|uuid/i.test(e.message)) { setToken(null); return saveResult(st); }
    note(!navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? "Risultato non salvato (connessione assente)." : "Risultato non salvato: " + esc(errMsg(e)));
  }
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
    <p>Per superarla serve almeno <b>${Math.round(CFG.passThreshold * 10)}/10</b>, cioè l'${Math.round(CFG.passThreshold * 100)}%, come per il test finale del Tecnico di 3° livello (Regolamento generale, art. 16).</p>
    <h3>Come vuoi farla</h3>
    <div class="tmodes" id="em">${[["", "📝 Normale"], ["voice", "🎙️ A voce"]].map(([k, v]) => `<button class="chip" data-em="${k}" aria-pressed="${!!S.prefs.examVoice === !!k}">${v}</button>`).join("")}</div>
    <button class="btn block" id="go" style="margin-top:12px">Inizia la simulazione</button></div>`;
  let examVoice = !!S.prefs.examVoice;
  $("#em").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; examVoice = !!b.dataset.em; $("#em").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b)); };
  $("#go").onclick = () => {
    S.prefs = { ...S.prefs, examVoice }; store.set("prefs", S.prefs);
    // un po' di tutto: estrazione bilanciata per argomento
    const byT = {}; shuffle(pool).forEach((q) => (byT[q.topic] ||= []).push(q));
    const list = []; const keys = shuffle(Object.keys(byT));
    while (list.length < Math.min(CFG.examQuestions, pool.length)) for (const k of keys) { if (byT[k].length && list.length < CFG.examQuestions) list.push(byT[k].pop()); }
    S.stack.pop();
    if (examVoice) return go(voiceQuizStart, { list: shuffle(list), mode: "simulazione_voce", topic: "tutti" }); // il tempo parte da "Inizia"
    go(runQuiz, { list: shuffle(list), mode: "exam", topic: "tutti", end: Date.now() + CFG.examMinutes * 60000 });
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
  stopVoice(); stopTimer(); S.inProgress = false;
  setTitle(st.mode === "simulazione_voce" ? "Simulazione a voce" : "Simulazione esame", true);
  const n = st.answers.length, pct = Math.round((st.ok / n) * 100), pass = st.ok / n >= CFG.passThreshold;
  S.history.push({ at: Date.now(), n, ok: st.ok, pct }); store.set("history", S.history.slice(-50));
  const byT = {}; st.answers.forEach((a) => { const t = (byT[a.q.topic] ||= { n: 0, ok: 0 }); t.n++; if (a.ok) t.ok++; });
  view.innerHTML = `<div class="card" style="text-align:center"><h2>${pass ? "🎉 Superata!" : "Non ancora superata"}</h2>
    <div class="big ${pass ? "pass" : "fail"}">${st.ok}/${n}</div><p>${pct}% · voto ${(st.ok / n * 10).toFixed(1)}/10 · soglia ${Math.round(CFG.passThreshold * 10)}/10</p>
    ${st.stopped ? `<p class="small muted">Interrotta: ${n} di ${st.list.length} domande affrontate.</p>` : ""}<p class="small muted" id="saveNote"></p></div>
    <h3>Per argomento</h3><div class="card">${Object.entries(byT).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([k, t]) =>
      `<div class="row small"><span>${esc(TOPICS[k] || k)}</span><span class="spacer"></span><b>${t.ok}/${t.n}</b></div>`).join("")}</div>
    ${wrongList(st)}
    <div class="grid2"><button class="btn secondary" id="h">Torna alla home</button><button class="btn" id="again">Nuova simulazione</button></div>`;
  $("#h").onclick = home; $("#again").onclick = () => { S.stack = [[home, []]]; go(examIntro); };
  saveResult(st);
}

/* ---------- ripasso errori ---------- */
function startReview() {
  const list = shuffle(S.questions.filter((q) => S.stats[q.id]?.open));
  if (!list.length) { setTitle("Ripasso errori", true); view.innerHTML = `<div class="card empty">🎉 Nessun errore da ripassare.<br>Una domanda sbagliata esce dal ripasso dopo 2 risposte giuste di fila.</div>`; return; }
  runQuiz({ list, mode: "review" });
}

/* ---------- quiz a voce ---------- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasTTS = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const NUM_WORDS = ["uno", "due", "tre", "quattro", "cinque", "sei"];
const VOICE_NUMS = [
  ["uno", "1", "prima", "primo", "a"], ["due", "2", "seconda", "secondo", "b", "bi"], ["tre", "3", "terza", "terzo", "c", "ci"],
  ["quattro", "4", "quarta", "quarto", "d", "di"], ["cinque", "5", "quinta", "quinto", "e"], ["sei", "6", "sesta", "sesto", "f", "effe"],
];
const VOICE_LETTERS = new Set(["a", "b", "bi", "c", "ci", "d", "di", "e", "f", "effe"]);
const VOICE_STOPWORDS = new Set("della delle degli dello dalla dalle dagli sono come anche quando quale quali questo questa quello quella perche sempre molto nella nelle negli tutti tutte essere".split(" "));
const VOICE_RATES = [["Lenta", 0.85], ["Normale", 1], ["Veloce", 1.2]];
const voicePrefs = () => ({ rate: 1, readOpts: true, readExpl: true, ...store.get("voiceprefs", {}) });
const normVoice = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Interpreta una frase detta: {answer: indice} | {cmd: "repeat"|"skip"|"stop"|"pause"|"next"} | null se non capita.
function parseVoice(text, options, phase) {
  const w = normVoice(text).split(" ").filter(Boolean);
  if (!w.length) return null;
  const has = (...k) => w.some((x) => k.includes(x)), short = w.length <= 4;
  if (phase === "confirm" && has("avanti", "prossima", "vai", "successiva", "continua")) return { cmd: "next" };
  if (short && has("ripeti", "ripetere", "ripetimi", "rileggi")) return { cmd: "repeat" };
  if (short && has("stop", "basta", "fine", "termina")) return { cmd: "stop" };
  if (short && has("pausa")) return { cmd: "pause" };
  if (phase !== "answer") return null;
  if (short && has("salta", "passo", "saltala")) return { cmd: "skip" };
  const byNumber = () => {
    const found = new Set();
    w.forEach((x, i) => VOICE_NUMS.forEach((alts, n) => {
      if (n >= options.length || !alts.includes(x)) return;
      if (x === "secondo" && ["me", "te", "noi", "voi", "lui", "lei"].includes(w[i + 1])) return; // «secondo me…» non è la risposta 2
      // le lettere ("a", "di", "ci"…) sono anche parole comuni: valgono solo in frasi brevi o dopo "risposta"/"lettera"
      if (VOICE_LETTERS.has(x) && !(w.length <= 2 || ["risposta", "lettera"].includes(w[i - 1]) || (w[i - 1] === "la" && w.length <= 3))) return;
      found.add(n);
    }));
    return found.size === 1 ? { answer: [...found][0] } : null;
  };
  const byText = () => {
    const sig = w.filter((x) => x.length >= 4 && !VOICE_STOPWORDS.has(x));
    if (!sig.length) return null;
    const sets = options.map((o) => new Set(normVoice(o).split(" ")));
    // parole dette che compaiono in una sola opzione
    const scores = sets.map((s, i) => sig.filter((x) => s.has(x) && sets.every((o, j) => j === i || !o.has(x))).length);
    const best = Math.max(...scores), i = scores.indexOf(best);
    if (!best || scores.filter((s) => s === best).length > 1) return null;
    const optSig = [...sets[i]].filter((x) => x.length >= 4 && !VOICE_STOPWORDS.has(x)).length;
    return best >= 2 || optSig <= 2 ? { answer: i } : null;
  };
  // frase lunga: prima il testo delle opzioni (può contenere numeri), poi il numero; frase breve: il contrario
  return w.length > 4 ? byText() || byNumber() : byNumber() || byText();
}

function voiceQuizStart(st) {
  const exam = st.mode === "simulazione_voce", P = voicePrefs();
  setTitle(exam ? "Simulazione a voce" : "Quiz a voce", true); stopTimer();
  const chips = (id, items, cur) => `<div class="chips" id="${id}">${items.map(([l, v]) => `<button class="chip" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  view.innerHTML = `<div class="card">
    <h2>🎙️ ${exam ? "Simulazione a voce" : "Quiz a voce"}</h2>
    <p>${st.list.length} domande${exam ? ` · ${CFG.examMinutes} minuti · soglia ${Math.round(CFG.passThreshold * 10)}/10, correzioni alla fine` : ""}.</p>
    <p class="small muted">Ascolta la domanda e rispondi dicendo il numero (es. «la due», «risposta tre») oppure tocca la risposta. Comandi: «ripeti», «salta», «pausa», «stop». Dopo ogni risposta di' «avanti» o tocca <b>Avanti ▶</b>.</p>
    ${!SpeechRec ? `<p class="vnote">Il riconoscimento vocale non è disponibile su questo browser: le domande vengono lette, rispondi toccando.</p>` : ""}
    ${!hasTTS() ? `<p class="vnote">La lettura vocale non è disponibile su questo browser: leggi le domande sullo schermo${SpeechRec ? " e rispondi a voce o toccando" : ""}.</p>` : ""}
    <h3>Velocità lettura</h3>${chips("vrate", VOICE_RATES, P.rate)}
    <h3>Leggi le risposte</h3>${chips("vopts", [["Sì", "1"], ["No", ""]], P.readOpts ? "1" : "")}
    ${exam ? "" : `<h3>Dopo un errore leggi la spiegazione</h3>${chips("vexpl", [["Sì", "1"], ["No", ""]], P.readExpl ? "1" : "")}`}
    <button class="btn block big-btn" id="vstart" style="margin-top:16px">▶ Inizia ${exam ? "simulazione" : "quiz"} a voce</button>
  </div>`;
  const bind = (id, key, conv) => {
    const el = $("#" + id); if (!el) return;
    el.onclick = (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      store.set("voiceprefs", { ...voicePrefs(), [key]: conv(b.dataset.v) });
      el.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
    };
  };
  bind("vrate", "rate", Number); bind("vopts", "readOpts", Boolean); bind("vexpl", "readExpl", Boolean);
  // il primo avvio deve partire da un tocco: è questo che permette lettura e microfono
  $("#vstart").onclick = () => {
    if (hasTTS()) { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch {} }
    if (exam) st.end = Date.now() + CFG.examMinutes * 60000;
    voiceQuiz(st);
  };
}

function voiceQuiz(st) {
  const exam = st.mode === "simulazione_voce", P = voicePrefs(), tts = hasTTS() ? speechSynthesis : null;
  st.i ??= 0; st.ok ??= 0; st.answers ??= [];
  S.inProgress = true;
  let gen = 0;          // ogni cambio di fase invalida letture e ascolti in corso
  let rec = null, paused = false, phase = "answer", fails = 0, micQ = false, q = null, v = null, last = null, confirmTries = 0;
  let micOff = !SpeechRec, micNote = ""; // permesso negato o rete assente: solo ascolto per il resto di questo quiz
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const status = (txt, cls = "") => { const el = $("#vs"); if (el) { el.textContent = txt; el.className = "vstatus " + cls; } };
  const stopMedia = () => {
    gen++;
    try { tts?.cancel(); } catch {}
    if (rec) { const r = rec; rec = null; try { r.abort(); } catch {} }
  };
  const onVis = () => { if (document.hidden && !paused) pause(); };
  document.addEventListener("visibilitychange", onVis);
  voiceCleanup = () => { stopMedia(); document.removeEventListener("visibilitychange", onVis); clearInterval(timerH); };

  // Lettura frase per frase: Chrome interrompe le letture troppo lunghe.
  const speakOne = (text) => new Promise((res) => {
    if (!tts || !text) return res();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT"; u.rate = P.rate;
    const it = tts.getVoices().filter((x) => /^it\b|^it[-_]/i.test(x.lang));
    if (it.length) u.voice = it.find((x) => x.localService) || it[0];
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, 3000 + (text.length * 120) / P.rate); // se il browser non segnala la fine
    tts.speak(u);
  });
  const say = async (parts, g) => { for (const p of parts) { if (g !== gen) return; await speakOne(p); } };

  const disableMic = (kind) => {
    micOff = true;
    micNote = kind === "perm"
      ? "Microfono bloccato. Per rispondere a voce consentilo: tocca il lucchetto accanto all'indirizzo (oppure Impostazioni del browser → Impostazioni sito → Microfono), scegli Consenti e ricarica la pagina. Intanto rispondi toccando."
      : "Serve internet per rispondere a voce: intanto le domande vengono lette, rispondi toccando.";
    if ($("#vnote")) $("#vnote").innerHTML = `<p class="vnote">${esc(micNote)}</p>`;
    toast(kind === "perm" ? "Microfono non consentito" : "Serve internet per rispondere a voce");
  };
  // Una frase dal microfono: {alts: [...]} | {err} | {off: true}
  const listen = (g) => new Promise((res) => {
    if (micOff || micQ || g !== gen) return res({ off: true });
    const r = new SpeechRec(); rec = r;
    r.lang = "it-IT"; r.interimResults = false; r.continuous = false; r.maxAlternatives = 3;
    let alts = null, err = null;
    r.onresult = (e) => { alts = [...e.results[0]].map((a) => a.transcript); };
    r.onerror = (e) => { err = e.error; };
    r.onend = () => { if (rec === r) rec = null; res({ alts, err }); };
    try { r.start(); if (g === gen) status("🎙️ Ti ascolto…", "listen"); } catch { rec = null; res({ err: "start" }); }
  });
  // Ascolta finché non arriva qualcosa di utile per la fase corrente.
  async function listenLoop(g) {
    while (g === gen && !paused) {
      const r = await listen(g);
      if (g !== gen) return;
      if (r.off) { status(phase === "answer" ? "Tocca la risposta sullo schermo" : "Tocca Avanti ▶ per continuare"); return; }
      if (r.err === "not-allowed" || r.err === "service-not-allowed") { disableMic("perm"); status("Tocca la risposta sullo schermo"); return; }
      if (r.err === "network") { disableMic("net"); status("Tocca la risposta sullo schermo"); return; }
      if (r.err === "aborted") return;
      const opts = phase === "answer" ? v.options : last.v.options;
      const hit = (r.alts || []).map((a) => parseVoice(a, opts, phase)).find(Boolean);
      if (hit) return handle(hit);
      if (phase === "confirm") { // in attesa di «avanti»: niente rimproveri, si riascolta qualche volta
        if (++confirmTries >= 3) { status("Tocca Avanti ▶ per continuare"); return; }
        continue;
      }
      if (++fails >= 2) { micQ = true; status("Tocca la risposta sullo schermo"); await say(["Tocca la risposta sullo schermo."], g); return; }
      status("Non ho capito");
      await say(["Non ho capito, dimmi il numero della risposta."], g);
      if (g !== gen) return; await wait(300);
    }
  }
  function handle(h) {
    if (h.cmd === "repeat") return phase === "answer" ? readQuestion() : readFeedback();
    if (h.cmd === "stop") return finish(true);
    if (h.cmd === "pause") return pause();
    if (h.cmd === "next") return next();
    if (h.cmd === "skip") return answer(null);
    if (h.answer != null) return answer(h.answer);
  }

  function render() {
    const cur = phase === "answer" ? { q, v } : last;
    const n = st.list.length, idx = phase === "answer" ? st.i : st.i - 1;
    view.innerHTML = `
    <div class="progress"><span>Domanda ${idx + 1} di ${n}</span>${exam ? `<span class="timer" id="tm"></span>` : `<span>✔ ${st.ok}</span>`}</div>
    <div class="bar neutral" style="margin-bottom:10px"><i style="width:${(st.i / n) * 100}%"></i></div>
    <div class="vstatus" id="vs" aria-live="polite"></div><div id="vnote">${micNote ? `<p class="vnote">${esc(micNote)}</p>` : ""}</div>
    <div class="card">
      ${qHeader(cur.q)}
      <div class="question">${esc(cur.q.question)}</div>
      <div class="opts">${cur.v.options.map((o, i) => `<button class="opt" data-i="${i}" ${phase !== "answer" ? "disabled" : ""}><span class="k">${i + 1}</span><span>${esc(o)}</span></button>`).join("")}</div>
      <div id="fb"></div>
      ${phase === "confirm" ? `<button class="btn block big-btn" id="vnext" style="margin-top:14px">${st.i < n ? "Avanti ▶" : exam ? "Vedi il risultato ▶" : "Vedi il riepilogo ▶"}</button>` : ""}
    </div>
    <div class="vctrl">
      <button class="btn" id="vpause">${paused ? "▶ Riprendi" : "⏸ Pausa"}</button>
      <button class="btn secondary" id="vrep">🔁 Ripeti</button>
      <button class="btn secondary" id="vexit">✖ Esci</button>
    </div>`;
    if (exam) tick(st);
    view.querySelectorAll(".opt").forEach((b) => (b.onclick = () => answer(+b.dataset.i)));
    $("#vpause").onclick = () => (paused ? resume() : pause());
    $("#vrep").onclick = () => { if (paused) { paused = false; } phase === "answer" ? readQuestion() : readFeedback(); $("#vpause").textContent = "⏸ Pausa"; };
    $("#vexit").onclick = () => {
      if (!confirm("Uscire dal quiz a voce? Le risposte date finora restano nelle statistiche ma il risultato non viene salvato.")) return;
      stopMedia(); S.inProgress = false; back();
    };
    if ($("#vnext")) $("#vnext").onclick = next;
    if (phase === "confirm") showFeedback();
  }
  function showQuestion() {
    if (st.i >= st.list.length) return finish(false);
    q = st.list[st.i]; v = shuffledView(q); phase = "answer"; fails = 0; micQ = false;
    render(); scrollTo(0, 0); readQuestion();
  }
  function readQuestion() {
    stopMedia(); const g = gen; if (paused) return;
    const parts = [`Domanda ${st.i + 1}.`, q.question];
    if (P.readOpts) v.options.forEach((o, i) => parts.push(`Risposta ${NUM_WORDS[i]}: ${o}.`));
    status(tts ? "🔊 Lettura…" : "");
    // il microfono parte solo dopo la fine della lettura (+300 ms), così non sente la voce del telefono
    say(parts, g).then(() => g === gen && wait(300)).then(() => g === gen && listenLoop(g));
  }
  function answer(i) {
    if (phase !== "answer") return;
    stopMedia(); paused = false; // toccare una risposta in pausa fa ripartire
    const ok = i != null && i === v.answer;
    if (ok) st.ok++;
    st.answers.push({ q, chosen: i == null ? null : v.order[i], ok });
    record(q, ok, st.mode);
    last = { q, v, i, ok }; st.i++; phase = "confirm"; confirmTries = 0;
    render();
    readFeedback();
  }
  function feedbackText() {
    const { q: lq, v: lv, i, ok } = last, right = `la ${NUM_WORDS[lv.answer]}: ${lv.options[lv.answer]}`;
    if (exam) return { title: i == null ? "Domanda saltata." : "Risposta registrata.", speak: [i == null ? "Domanda saltata." : "Risposta registrata."] };
    if (ok) return { title: "✅ Esatto!", speak: ["Esatto!"] };
    const head = i == null ? `Domanda saltata. La risposta giusta è ${right}.` : `Sbagliato. La risposta giusta è ${right}.`;
    return { title: (i == null ? "⏭ " : "❌ ") + head, speak: [head, ...(P.readExpl && lq.explanation ? [lq.explanation] : [])] };
  }
  function showFeedback() {
    const { q: lq, v: lv, i, ok } = last, f = feedbackText();
    view.querySelectorAll(".opt").forEach((b) => {
      const bi = +b.dataset.i;
      if (exam) { if (bi === i) b.classList.add("sel"); return; }
      if (bi === lv.answer) b.classList.add("right"); else if (bi === i) b.classList.add("wrong");
    });
    $("#fb").innerHTML = exam ? `<div class="explain"><div class="verdict" style="color:var(--text)">${esc(f.title)}</div></div>`
      : `<div class="explain ${ok ? "" : "ko"}"><div class="verdict">${esc(f.title)}</div>${esc(lq.explanation)}<div class="src">📖 ${esc(lq.source)}</div></div>`;
  }
  function readFeedback() {
    stopMedia(); const g = gen; if (paused) return;
    status(tts ? "🔊 Lettura…" : "");
    say(feedbackText().speak, g).then(() => g === gen && wait(300)).then(() => g === gen && listenLoop(g));
  }
  function next() { if (phase !== "confirm") return; stopMedia(); showQuestion(); }
  function pause() {
    paused = true; stopMedia(); status("⏸ In pausa");
    if ($("#vpause")) $("#vpause").textContent = "▶ Riprendi";
  }
  function resume() {
    paused = false; if ($("#vpause")) $("#vpause").textContent = "⏸ Pausa";
    if (phase === "answer") readQuestion();
    else { stopMedia(); const g = gen; confirmTries = 0; listenLoop(g); if (micOff) status("Tocca Avanti ▶ per continuare"); }
  }
  function finish(stopped) {
    stopMedia();
    if (stopped && !st.answers.length) { S.inProgress = false; toast("Quiz interrotto"); return back(); }
    st.stopped = stopped;
    exam ? examResult(st) : endQuiz(st);
  }
  // si riparte dalla domanda non ancora risposta (o dalla prima)
  showQuestion();
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
// onSubmit può restituire "keep" per lasciare aperta la finestra (es. quando apre il passo successivo).
function dialog(html, onSubmit, { ok = "Invia", onCancel } = {}) {
  const d = $("#dlg"), f = $("#dlgForm");
  f.innerHTML = html + `<p class="small dlg-err" id="dlgErr" role="alert"></p><div class="row end" style="margin-top:14px"><button class="btn secondary" value="cancel" formnovalidate>Annulla</button><button class="btn" value="ok">${ok}</button></div>`;
  f.onsubmit = async (e) => {
    if (e.submitter?.value !== "ok") { onCancel?.(); return; }
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; $("#dlgErr", f).textContent = "";
    try { if ((await onSubmit(f)) !== "keep") d.close(); } catch (err) { $("#dlgErr", f).textContent = err.message || "Errore"; } finally { btn.disabled = false; }
  };
  d.oncancel = () => onCancel?.();
  if (!d.open) d.showModal();
  f.querySelector("input,textarea")?.focus();
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

/* ---------- PIN personale (solo per lo storico spiegazioni) ---------- */
const CANCELLED = "annullato";
const setToken = (t) => { S.token = t; t ? store.set("token", t) : store.del("token"); };
const pinField = (id, label, auto) => `<label for="${id}">${label}</label><input id="${id}" type="password" inputmode="numeric" autocomplete="${auto}" required maxlength="8">`;
function pinLoginDialog(resolve) {
  dialog(`<h2>Accesso con PIN</h2>
    <p class="small muted">Accedi come <b>${esc(S.user.name)}</b>. Primo accesso? Usa il PIN iniziale ricevuto dall'amministratore, poi sceglierai il tuo.</p>
    ${pinField("upin", "PIN", "current-password")}
    <p class="small muted">PIN dimenticato? Scrivi all'amministratore, che lo azzera: rientrerai con il PIN iniziale e ne sceglierai uno nuovo.</p>`,
    async (f) => {
      if (!navigator.onLine) throw new Error("Serve la connessione per accedere con il PIN.");
      let r;
      try { r = await rpc("quiz_user_login", { p_code: S.user.code, p_name: S.user.name, p_pin: $("#upin", f).value.trim() }); }
      catch (e) { throw new Error(errMsg(e)); }
      if (r?.error === "pin_non_valido") {
        $("#upin", f).value = "";
        const n = r.attempts_left;
        throw new Error(n == null ? "PIN errato." : n > 0 ? `PIN errato, ti ${n === 1 ? "resta 1 tentativo" : `restano ${n} tentativi`}.` : "PIN errato. Troppi tentativi: riprova tra 15 minuti.");
      }
      if (r?.error === "utente_bloccato") {
        const min = Math.max(1, Math.ceil((Date.parse(r.locked_until) - Date.now()) / 60000) || 15);
        throw new Error(`Troppi tentativi: riprova tra ${min} ${min === 1 ? "minuto" : "minuti"}.`);
      }
      if (!r?.token) throw new Error("Accesso non riuscito.");
      if (r.must_change) { choosePinDialog(r.token, resolve, true); return "keep"; }
      setToken(r.token); resolve(r.token);
    }, { ok: "Entra", onCancel: () => resolve(null) });
}
// first = true: scelta obbligatoria dopo il PIN iniziale; se annulla, la sessione non viene tenuta.
function choosePinDialog(token, resolve, first) {
  dialog(`<h2>${first ? "Scegli il tuo PIN personale" : "Cambia PIN"}</h2>
    <p class="small muted">${first ? "Lo userai per entrare nell'app, anche da altri dispositivi. " : ""}Da 4 a 8 cifre, diverso dal PIN iniziale.</p>
    ${pinField("np1", "Nuovo PIN", "new-password")}${pinField("np2", "Ripeti il nuovo PIN", "new-password")}`,
    async (f) => {
      const a = $("#np1", f).value.trim(), b = $("#np2", f).value.trim();
      if (!/^\d{4,8}$/.test(a)) throw new Error(ERRORS.pin_formato);
      if (a !== b) throw new Error("I due PIN non coincidono.");
      try { await rpc("quiz_user_set_pin", { p_token: token, p_new_pin: a }); }
      catch (e) { if (/sessione_non_valida/.test(e.message)) setToken(null); throw new Error(errMsg(e)); }
      if (first) S.firstPinAt = Date.now();
      setToken(token); toast(first ? "PIN personale salvato ✓" : "PIN cambiato ✓"); resolve(token);
    }, { ok: "Salva PIN", onCancel: () => { if (first) rpc("quiz_user_logout", { p_token: token }).catch(() => {}); resolve(null); } });
}
// Restituisce un token valido, chiedendo il PIN se serve (null se l'utente annulla).
function requireToken() {
  return S.token ? Promise.resolve(S.token) : new Promise((res) => pinLoginDialog(res));
}
// Chiamata con il token; se la sessione non è più valida richiede il PIN e riprova una volta.
async function userRpc(fn, args = {}) {
  for (let i = 0; ; i++) {
    const token = await requireToken();
    if (!token) throw new Error(CANCELLED);
    try { return await rpc(fn, { p_token: token, ...args }); }
    catch (e) {
      if (i === 0 && /sessione_non_valida|cambia_pin_prima|uuid/i.test(e.message)) { setToken(null); continue; }
      throw new Error(errMsg(e));
    }
  }
}
async function changePin() {
  if (!navigator.onLine) return toast("Serve la connessione per cambiare il PIN.");
  const chosenBefore = S.firstPinAt;
  const token = await requireToken(); if (!token) return home();
  if (S.firstPinAt !== chosenBefore) return home(); // ha appena scelto il PIN personale: basta così
  await new Promise((r) => setTimeout(r)); // lascia chiudere la finestra del PIN attuale
  choosePinDialog(token, () => home(), false);
}
// Schermata obbligatoria finché su questo dispositivo non c'è un accesso con PIN.
function pinGate() {
  S.stack = [[pinGate, []]]; S.inProgress = false; setTitle("Quiz Master Trainer", false);
  view.innerHTML = `<div class="card">
    <h2>Accesso con PIN</h2>
    <p>Ciao <b>${esc(S.user.name)}</b>. Per usare l'app serve il tuo PIN personale: lo inserisci una volta su questo dispositivo.</p>
    <p class="small muted">Primo accesso? Usa il PIN iniziale ricevuto dall'amministratore, poi sceglierai il tuo.</p>
    <button class="btn block big-btn" id="gpin" style="margin-top:12px">Inserisci il PIN</button>
    <p class="small muted" style="margin-top:14px">Registriamo il tuo nome e la data dell'ultimo accesso, per sapere chi usa lo strumento di studio del corso. Nell'area amministratore non compaiono i tuoi risultati né i tuoi voti.</p>
    <p class="small muted">Non sei ${esc(S.user.name)}? <a href="#" id="gout">Esci</a></p>
  </div>`;
  $("#gpin").onclick = async () => { if (await requireToken()) home(); };
  $("#gout").onclick = (e) => { e.preventDefault(); S.user = null; store.del("user"); login(); };
}
// All'apertura (e al ritorno sull'app dopo un po'): aggiorna "ultimo accesso" sul server e verifica la sessione.
// Usa una funzione esistente legata al PIN, che restituisce solo i risultati della persona stessa.
function pingUser() {
  if (!S.token || !navigator.onLine) return;
  S.lastPing = Date.now();
  rpc("quiz_result_list", { p_token: S.token }).catch((e) => {
    if (!/sessione_non_valida|cambia_pin_prima|uuid/i.test(e.message)) return; // rete: si riprova alla prossima apertura
    setToken(null);
    if (!S.inProgress && S.stack[S.stack.length - 1]?.[0] === home) home(); // PIN azzerato dall'amministratore: chiede di nuovo il PIN
  });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - (S.lastPing || 0) > 30 * 60000) pingUser(); });
async function leaveHistory() {
  const t = S.token; setToken(null);
  if (t) rpc("quiz_user_logout", { p_token: t }).catch(() => {});
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

/* ---------- storico spiegazioni ---------- */
const fmtScore = (n) => (n == null ? "–" : (Math.round(n * 10) / 10).toLocaleString("it-IT"));
const avgOf = (a) => { const s = a.filter((x) => x.score != null).map((x) => +x.score); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
async function historyPage() {
  setTitle("Storico spiegazioni", true);
  if (!navigator.onLine) { view.innerHTML = `<div class="card empty">📡 Lo storico richiede la connessione.</div>`; return; }
  view.innerHTML = `<div class="card empty">Caricamento…</div>`;
  let list;
  try { list = await userRpc("quiz_feedback_list"); }
  catch (e) {
    if (S.stack[S.stack.length - 1]?.[0] !== historyPage) return; // l'utente è già tornato indietro
    if (e.message === CANCELLED) return back();
    view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return;
  }
  if (S.stack[S.stack.length - 1]?.[0] !== historyPage) return;
  if (!list.length) {
    view.innerHTML = `<div class="card empty">Nessuna spiegazione salvata.<br>Allenati con <b>Spiega a voce</b> e salva il feedback dell'IA: lo ritrovi qui.</div>`; return;
  }
  const byT = {}; list.forEach((f) => (byT[f.topic] ||= []).push(f));
  const rows = Object.entries(byT).map(([k, a]) => ({ k, n: a.length, avg: avgOf(a) }))
    .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99) || b.n - a.n);
  const all = avgOf(list);
  const cls = (v) => (v == null ? "" : v < 6 ? "fail" : v < 8 ? "mid" : "pass");
  view.innerHTML = `<div class="card">
      <div class="grid2 stats"><div><div class="big">${list.length}</div><div class="small muted">${list.length === 1 ? "prova" : "prove"}</div></div>
      <div><div class="big ${cls(all)}">${fmtScore(all)}</div><div class="small muted">voto medio</div></div></div>
      <h3>Per argomento</h3>
      <table class="fonti"><thead><tr><th>Argomento</th><th class="num">Prove</th><th class="num">Voto medio</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(TOPICS[r.k] || r.k || "–")}</td><td class="num">${r.n}</td><td class="num">${r.avg == null ? `<span class="muted">–</span>` : `<b class="${cls(r.avg)}">${fmtScore(r.avg)}</b>`}</td></tr>`).join("")}</tbody></table>
      <p class="small muted" style="margin-top:8px">In cima gli argomenti con il voto più basso: lì serve più allenamento.</p>
    </div>
    <h3>Le tue prove</h3>
    <div id="hl">${list.map((f) => `<details class="card hist" data-id="${esc(f.id)}"><summary>
        <div class="row"><span class="small muted">${new Date(f.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span><span class="spacer"></span>${f.score == null ? `<span class="small muted">senza voto</span>` : `<b class="${cls(+f.score)}">${fmtScore(+f.score)}/10</b>`}</div>
        <div class="tag" style="display:inline-block;margin:6px 0">${esc(TOPICS[f.topic] || f.topic || "–")}</div>
        <div class="hist-task">${esc(f.task)}</div></summary>
      <div class="feedback">${esc(f.feedback || "(nessun testo)")}</div>
      <div class="row end"><button class="btn ghost" data-del="${esc(f.id)}">🗑 Elimina</button></div></details>`).join("")}</div>`;
  $("#hl").onclick = async (e) => {
    const id = e.target.closest("[data-del]")?.dataset.del; if (!id) return;
    if (!confirm("Eliminare questa prova dallo storico?")) return;
    try { await userRpc("quiz_feedback_delete", { p_id: id }); toast("Prova eliminata"); historyPage(); }
    catch (err) { if (err.message !== CANCELLED) toast(err.message); }
  };
}

/* ---------- i miei risultati ---------- */
const RES_LABEL = { quiz: "📝 Quiz", simulazione: "⏱️ Simulazione", quiz_voce: "🎙️ Quiz a voce", simulazione_voce: "🎙️ Simulazione a voce" };
const resTopic = (t) => (!t || t === "tutti" ? "Tutti gli argomenti" : t === "vari" ? "Più argomenti" : t.split(",").map((k) => TOPICS[k] || k).join(", "));
const fmtPct = (n) => Math.round(+n) + "%";
async function resultsPage(filter = "all") {
  setTitle("I miei risultati", true);
  if (!navigator.onLine) { view.innerHTML = `<div class="card empty">📡 I risultati richiedono la connessione.</div>`; return; }
  view.innerHTML = `<div class="card empty">Caricamento…</div>`;
  let list;
  try { list = await userRpc("quiz_result_list"); }
  catch (e) {
    if (S.stack[S.stack.length - 1]?.[0] !== resultsPage) return;
    if (e.message === CANCELLED) return back();
    view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return;
  }
  if (S.stack[S.stack.length - 1]?.[0] !== resultsPage) return;
  S.stack[S.stack.length - 1][1] = [filter];
  const draw = () => {
    const shown = list.filter((r) => filter === "all" || r.mode === filter);
    const avg = shown.length ? shown.reduce((a, r) => a + +r.score, 0) / shown.length : null;
    const best = shown.reduce((b, r) => (!b || +r.score > +b.score ? r : b), null);
    view.innerHTML = `
      <div class="chips" id="rf">${[["all", "Tutte"], ...Object.entries(RES_LABEL)].map(([k, v]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${k === "all" ? v : v.replace(/^\S+ /, "")}</button>`).join("")}</div>
      <div class="card" style="margin-top:12px"><div class="stats res-stats">
        <div><div class="big">${shown.length}</div><div class="small muted">${shown.length === 1 ? "prova" : "prove"}</div></div>
        <div><div class="big">${avg == null ? "–" : fmtPct(avg)}</div><div class="small muted">media</div></div>
        <div><div class="big pass">${best ? fmtPct(best.score) : "–"}</div><div class="small muted">miglior risultato</div></div></div></div>
      ${shown.length ? `<div id="rl">${shown.map((r) => {
        const sim = r.mode === "simulazione" || r.mode === "simulazione_voce", wrong = Array.isArray(r.wrong_ids) ? r.wrong_ids.length : 0;
        return `<div class="card res">
          <div class="row"><span class="small muted">${new Date(r.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span><span class="spacer"></span>
            ${sim && r.passed != null ? `<span class="tag ${r.passed ? "on" : "lock"}">${r.passed ? "Promosso" : "Non promosso"}</span>` : ""}</div>
          <div class="row" style="margin-top:4px"><b class="res-mode">${RES_LABEL[r.mode] || esc(r.mode)}</b><span class="spacer"></span><b class="${+r.score >= 80 ? "pass" : +r.score >= 60 ? "mid" : "fail"}">${fmtPct(r.score)}</b></div>
          <div class="small muted">${esc(resTopic(r.topic))} · ${r.correct}/${r.total} corrette</div>
          <div class="row end" style="margin-top:8px">${wrong ? `<button class="btn secondary" data-rev="${esc(r.id)}">🔁 Ripassa gli errori (${wrong})</button>` : ""}<button class="btn ghost" data-del="${esc(r.id)}">🗑 Elimina</button></div>
        </div>`;
      }).join("")}</div>` : `<div class="card empty">${list.length ? "Nessun risultato con questo filtro." : "Nessun risultato salvato.<br>Finisci un quiz o una simulazione: il risultato arriva qui."}</div>`}`;
    $("#rf").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; filter = b.dataset.f; S.stack[S.stack.length - 1][1] = [filter]; draw(); };
    if ($("#rl")) $("#rl").onclick = async (e) => {
      const rev = e.target.closest("[data-rev]")?.dataset.rev, del = e.target.closest("[data-del]")?.dataset.del;
      if (rev) {
        const r = list.find((x) => x.id === rev), ids = new Set(r.wrong_ids);
        const qs = S.questions.filter((q) => ids.has(q.id)); // solo le domande ancora attive
        if (!qs.length) return toast("Le domande sbagliate non sono più disponibili.");
        if (qs.length < ids.size) toast(`${ids.size - qs.length} domande non sono più disponibili: ripassi le altre ${qs.length}.`);
        return go(runQuiz, { list: shuffle(qs), mode: "train", topic: r.mode.startsWith("simulazione") ? "tutti" : r.topic });
      }
      if (del) {
        if (!confirm("Eliminare questo risultato?")) return;
        try { await userRpc("quiz_result_delete", { p_id: del }); list = list.filter((x) => x.id !== del); toast("Risultato eliminato"); draw(); }
        catch (err) { if (err.message !== CANCELLED) toast(err.message); }
      }
    };
  };
  draw();
}

/* ---------- podcast ---------- */
const POD_MAX = 50 * 1024 * 1024;
const POD_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm"];
const POD_EXT = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac", webm: "audio/webm" };
const POD_RATES = [1, 1.25, 1.5];
const podTopic = (k) => TOPICS[k] || (k === "generale" ? "Generale" : k || "Generale");
const podType = (f) => f.type || POD_EXT[(f.name.split(".").pop() || "").toLowerCase()] || "";
const fmtDur = (s) => {
  if (!(s > 0)) return "";
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${String(m).padStart(2, "0")}:${x}`;
};
const fmtMB = (b) => (b / 1048576).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " MB";
const fmtDay = (d) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const byTopicOrder = (a, b) => { const o = Object.keys(TOPICS), i = (k) => (o.includes(k) ? o.indexOf(k) : 999); return i(a) - i(b) || String(a).localeCompare(b); };
// Un solo audio alla volta in tutta l'app.
document.addEventListener("play", (e) => document.querySelectorAll("audio").forEach((a) => a !== e.target && a.pause()), true);

async function podcastPage() {
  setTitle("Podcast", true);
  view.innerHTML = `<div class="card empty">Caricamento…</div>`;
  let list;
  try {
    if (!navigator.onLine) throw new Error("offline");
    list = (await podcastApi({ action: "list", code: S.user.code })).podcasts || [];
  } catch (e) {
    if (S.stack[S.stack.length - 1]?.[0] !== podcastPage) return; // l'utente è già tornato indietro
    if (/codice_non_valido/.test(e.message)) { toast("Il codice corso è cambiato: rientra."); login(); return; }
    view.innerHTML = `<div class="card empty">📡 Per ascoltare i podcast serve la connessione.</div>`; return;
  }
  if (S.stack[S.stack.length - 1]?.[0] !== podcastPage) return;
  renderPodcasts(list, "all");
}
function renderPodcasts(list, filter) {
  const note = `<p class="small muted" style="margin-top:16px">Podcast di ripasso generati con l'intelligenza artificiale a partire dai documenti del corso: possono contenere imprecisioni, in caso di dubbio fa fede il testo originale (vedi Fonti).</p>`;
  if (!list.length) { view.innerHTML = `<div class="card empty">Nessun podcast disponibile per ora.</div>${note}`; return; }
  const rate = store.get("podrate", 1), seen = store.get("podseen", {});
  const topics = [...new Set(list.map((p) => p.topic || "generale"))].sort(byTopicOrder);
  const shown = topics.filter((t) => filter === "all" || t === filter);
  view.innerHTML = `
    <div class="chips" id="ptop"><button class="chip" data-t="all" aria-pressed="${filter === "all"}">Tutti</button>${topics.map((t) => `<button class="chip" data-t="${esc(t)}" aria-pressed="${filter === t}">${esc(podTopic(t))}</button>`).join("")}</div>
    <div class="row" style="margin-top:10px"><span class="small muted">Velocità</span><div class="chips" id="prate">${POD_RATES.map((r) => `<button class="chip" data-r="${r}" aria-pressed="${rate === r}">${String(r).replace(".", ",")}x</button>`).join("")}</div></div>
    ${shown.map((t) => `<h3>${esc(podTopic(t))}</h3>` + list.filter((p) => (p.topic || "generale") === t).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map((p) => `
      <div class="card pod" data-id="${esc(p.id)}">
        <div class="row"><b class="pod-title">${esc(p.title)}</b><span class="spacer"></span>${seen[p.id] ? '<span class="seen">✓ ascoltato</span>' : ""}</div>
        <div class="small muted">${[esc(podTopic(p.topic)), fmtDur(p.duration_sec), fmtDay(p.created_at)].filter(Boolean).join(" · ")}</div>
        ${p.description ? `<p class="small">${esc(p.description)}</p>` : ""}
        <audio controls preload="none" src="${esc(p.url)}" data-id="${esc(p.id)}" data-dur="${+p.duration_sec || ""}"></audio>
      </div>`).join("")).join("")}
    ${note}`;
  const savePos = (a) => { if (a.ended || !(a.currentTime > 0)) return; const p = store.get("podpos", {}); p[a.dataset.id] = Math.floor(a.currentTime); store.set("podpos", p); };
  view.querySelectorAll("audio").forEach((a) => {
    a.defaultPlaybackRate = a.playbackRate = rate;
    a.onloadedmetadata = () => {
      const s = store.get("podpos", {})[a.dataset.id];
      const d = isFinite(a.duration) ? a.duration : +a.dataset.dur || Infinity; // senza durata dal file uso quella registrata
      if (s && d - s > 10) a.currentTime = s;
      a.playbackRate = store.get("podrate", 1);
    };
    a.ontimeupdate = () => { if (Date.now() - (a._saved || 0) >= 5000) { a._saved = Date.now(); savePos(a); } };
    a.onpause = () => savePos(a);
    a.onended = () => {
      const p = store.get("podpos", {}); delete p[a.dataset.id]; store.set("podpos", p);
      const s = store.get("podseen", {}); s[a.dataset.id] = Date.now(); store.set("podseen", s);
      const row = a.closest(".pod").querySelector(".row");
      if (!row.querySelector(".seen")) row.insertAdjacentHTML("beforeend", '<span class="seen">✓ ascoltato</span>');
    };
  });
  $("#ptop").onclick = (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    view.querySelectorAll("audio").forEach((a) => { savePos(a); a.pause(); });
    renderPodcasts(list, b.dataset.t);
  };
  $("#prate").onclick = (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const r = +b.dataset.r; store.set("podrate", r);
    $("#prate").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
    view.querySelectorAll("audio").forEach((a) => (a.defaultPlaybackRate = a.playbackRate = r));
  };
}

// Area amministratore: caricamento ed elenco dei podcast.
function podAdminError(e) {
  if (/pin_non_valido/.test(e.message)) { S.adminPin = null; S.admin = null; toast("PIN amministratore non più valido: rientra."); adminLogin(); return; }
  toast(errMsg(e));
}
function putWithProgress(url, file, type, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url); x.setRequestHeader("Content-Type", type);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("file_non_caricato")));
    x.onerror = () => reject(new Error("Failed to fetch"));
    x.send(file);
  });
}
async function adminPodcasts(ap) {
  ap.innerHTML = `<div class="card"><h2>Carica un nuovo podcast</h2>
    <form id="pform" novalidate>
      <label for="pfile">File audio (MP3, M4A, WAV, OGG, AAC, WEBM · max 50 MB)</label><input id="pfile" type="file" accept="audio/*">
      <p class="small muted" id="pinfo"></p>
      <label for="ptopic">Argomento</label><select id="ptopic">${Object.entries(TOPICS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}<option value="generale">Generale</option></select>
      <label for="ptitle">Titolo</label><input id="ptitle" type="text" required maxlength="200">
      <label for="pdesc">Descrizione (facoltativa)</label><textarea id="pdesc" maxlength="2000"></textarea>
      <div id="pprog" hidden style="margin-top:12px"><div class="bar"><i style="width:0%"></i></div><p class="small muted" id="ppct">0%</p></div>
      <button class="btn block" id="pgo" style="margin-top:12px">Carica e pubblica</button>
    </form></div>
    <div id="plist"><div class="card empty">Caricamento…</div></div>`;
  let dur = null, pick = 0;
  $("#pfile").onchange = () => {
    const f = $("#pfile").files[0], my = ++pick; dur = null; $("#pinfo").textContent = "";
    if (!f) return;
    if (!$("#ptitle").value.trim()) $("#ptitle").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    $("#pinfo").textContent = fmtMB(f.size);
    const u = URL.createObjectURL(f), a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => { URL.revokeObjectURL(u); if (my !== pick) return; dur = isFinite(a.duration) ? Math.round(a.duration) : null; $("#pinfo").textContent = `${fmtMB(f.size)}${dur ? " · durata " + fmtDur(dur) : ""}`; };
    a.onerror = () => { URL.revokeObjectURL(u); if (my === pick) $("#pinfo").textContent = `${fmtMB(f.size)} · durata non leggibile`; };
    a.src = u;
  };
  $("#pform").onsubmit = async (e) => {
    e.preventDefault();
    const f = $("#pfile").files[0], type = f ? podType(f) : "", title = $("#ptitle").value.trim();
    if (!f) return toast("Scegli un file audio");
    if (f.size > POD_MAX) return toast("File oltre 50 MB: convertilo in MP3 e riprova");
    if (!POD_TYPES.includes(type)) return toast(ERRORS.formato_non_supportato);
    if (!title) return toast("Scrivi il titolo");
    const btn = $("#pgo"), bar = $("#pprog i"), pct = $("#ppct");
    const show = (p, t) => { $("#pprog").hidden = false; bar.style.width = Math.round(p * 100) + "%"; pct.textContent = t || Math.round(p * 100) + "%"; };
    btn.disabled = true; show(0, "Preparazione…");
    try {
      const up = await podcastApi({ action: "upload_url", pin: S.adminPin, contentType: type, size: f.size });
      await putWithProgress(up.signedUrl, f, type, (p) => show(p));
      show(1, "Registrazione…");
      await podcastApi({ action: "register", pin: S.adminPin, path: up.path, topic: $("#ptopic").value, title, description: $("#pdesc").value.trim(), size: f.size, duration: dur });
      toast("Podcast pubblicato"); adminPodcasts(ap);
    } catch (err) { $("#pprog").hidden = true; podAdminError(err); }
    finally { btn.disabled = false; }
  };
  let list;
  try { list = (await podcastApi({ action: "admin_list", pin: S.adminPin })).podcasts || []; }
  catch (err) { if (!ap.isConnected) return; $("#plist").innerHTML = `<div class="card empty">${esc(errMsg(err))}</div>`; if (/pin_non_valido/.test(err.message)) podAdminError(err); return; }
  if (!ap.isConnected) return;
  list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  $("#plist").innerHTML = `<h3>Podcast caricati (${list.length})</h3>` + (list.length ? list.map((p) => `<div class="card pod">
      <div class="row"><b class="pod-title">${esc(p.title)}</b><span class="spacer"></span><span class="tag ${p.active ? "on" : "off"}">${p.active ? "Attivo" : "Nascosto"}</span></div>
      <div class="small muted">${[esc(podTopic(p.topic)), fmtDur(p.duration_sec), p.size_bytes ? fmtMB(p.size_bytes) : "", fmtDay(p.created_at)].filter(Boolean).join(" · ")}</div>
      ${p.description ? `<p class="small">${esc(p.description)}</p>` : ""}
      ${p.url ? `<audio controls preload="none" src="${esc(p.url)}"></audio>` : ""}
      <div class="row end" style="margin-top:10px"><button class="btn secondary" data-edit="${esc(p.id)}">Modifica</button><button class="btn secondary" data-act="${esc(p.id)}">${p.active ? "Nascondi" : "Pubblica"}</button><button class="btn danger" data-del="${esc(p.id)}">Elimina</button></div>
    </div>`).join("") : `<div class="card empty">Nessun podcast caricato.</div>`);
  $("#plist").onclick = async (e) => {
    const b = e.target.closest("button[data-edit],button[data-act],button[data-del]"); if (!b) return;
    const p = list.find((x) => x.id === (b.dataset.edit || b.dataset.act || b.dataset.del));
    if (b.dataset.edit) {
      return dialog(`<h2>Modifica podcast</h2>
        <label for="et">Titolo</label><input id="et" type="text" required maxlength="200" value="${esc(p.title)}">
        <label for="eto">Argomento</label><select id="eto">${[...Object.entries(TOPICS), ["generale", "Generale"]].map(([k, v]) => `<option value="${k}" ${p.topic === k ? "selected" : ""}>${esc(v)}</option>`).join("")}${p.topic && !TOPICS[p.topic] && p.topic !== "generale" ? `<option value="${esc(p.topic)}" selected>${esc(p.topic)}</option>` : ""}</select>
        <label for="ed">Descrizione</label><textarea id="ed" maxlength="2000">${esc(p.description || "")}</textarea>`,
        async (f) => {
          try { await podcastApi({ action: "update", pin: S.adminPin, id: p.id, title: $("#et", f).value.trim(), topic: $("#eto", f).value, description: $("#ed", f).value.trim() }); }
          catch (err) { if (/pin_non_valido/.test(err.message)) { podAdminError(err); return; } throw new Error(errMsg(err)); }
          toast("Podcast aggiornato"); adminPodcasts(ap);
        }, { ok: "Salva" });
    }
    if (b.dataset.del && !confirm("Eliminare definitivamente il podcast e il file audio?")) return;
    b.disabled = true;
    try {
      if (b.dataset.act) { await podcastApi({ action: "update", pin: S.adminPin, id: p.id, active: !p.active }); toast(p.active ? "Podcast nascosto ai corsisti" : "Podcast pubblicato"); }
      else { await podcastApi({ action: "delete", pin: S.adminPin, id: p.id }); toast("Podcast eliminato"); }
      adminPodcasts(ap);
    } catch (err) { b.disabled = false; podAdminError(err); }
  };
}

/* ---------- fonti ---------- */
function fontiPage() {
  setTitle("Fonti", true);
  view.innerHTML = `<div class="card"><h2>Documenti di riferimento</h2>
    <table class="fonti"><thead><tr><th>Documento</th><th>Versione</th></tr></thead>
    <tbody>${FONTI.map(([d, v]) => `<tr><td>${esc(d)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
    <p class="small muted" style="margin-top:14px">Strumento di studio non ufficiale. In caso di dubbio fa fede il testo dei documenti originali.
    Per segnalare un documento più recente o proporne uno nuovo, scrivi all'amministratore.</p></div>`;
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
  const tabs = { prop: `Proposte (${A.proposals.length})`, rep: `Segnalazioni (${A.reports.length})`, q: "Domande", users: "Corsisti", pod: "Podcast", set: "Impostazioni" };
  view.innerHTML = `<div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="chip" data-t="${k}" aria-pressed="${k === tab}">${v}</button>`).join("")}</div><div id="ap"></div>`;
  view.querySelector(".tabs").onclick = (e) => { const b = e.target.closest(".chip"); if (b) adminPanel(b.dataset.t); };
  const cur = view.querySelector('.tabs [aria-pressed="true"]'), tb = cur.parentElement;
  tb.scrollLeft = Math.max(0, cur.offsetLeft - tb.offsetLeft - (tb.clientWidth - cur.offsetWidth) / 2); // scheda attiva sempre visibile
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
  } else if (tab === "users") {
    adminUsers(ap);
  } else if (tab === "pod") {
    adminPodcasts(ap);
  } else {
    ap.innerHTML = `<div class="card"><h2>Codice corso</h2><p class="small muted">Da comunicare ai corsisti. Cambiandolo, chi è già dentro dovrà reinserirlo.</p>
      <div class="row"><input type="text" id="cc" placeholder="Nuovo codice corso" style="flex:1"><button class="btn" id="scc">Salva</button></div></div>
      <div class="card"><h2>PIN iniziale comune</h2><p class="small muted">Lo usano i corsisti al primo accesso all'app e dopo un azzeramento; poi ognuno sceglie il suo. Chi ha già il PIN personale non cambia nulla.</p>
      <div class="row"><input type="password" id="dp" inputmode="numeric" maxlength="8" placeholder="Nuovo PIN iniziale (4-8 cifre)" style="flex:1"><button class="btn" id="sdp">Salva</button></div></div>
      <div class="card"><h2>PIN amministratore</h2><div class="row"><input type="password" id="np" placeholder="Nuovo PIN" style="flex:1"><button class="btn" id="snp">Salva</button></div></div>
      <div class="card"><button class="btn secondary block" id="lo">Esci dall'area amministratore</button></div>`;
    $("#scc").onclick = async () => { const v = $("#cc").value.trim(); if (v.length < 4) return toast("Almeno 4 caratteri"); await rpc("quiz_admin_set_code", { p_pin: S.adminPin, p_key: "course_code", p_new: v }); S.user.code = v; store.set("user", S.user); toast("Codice corso aggiornato"); };
    $("#snp").onclick = async () => { const v = $("#np").value.trim(); if (v.length < 4) return toast("Almeno 4 caratteri"); await rpc("quiz_admin_set_code", { p_pin: S.adminPin, p_key: "admin_pin", p_new: v }); S.adminPin = v; toast("PIN aggiornato"); };
    $("#sdp").onclick = async () => {
      const v = $("#dp").value.trim(); if (!/^\d{4,8}$/.test(v)) return toast("Il PIN iniziale deve avere da 4 a 8 cifre");
      try { await rpc("quiz_admin_set_code", { p_pin: S.adminPin, p_key: "default_pin", p_new: v }); $("#dp").value = ""; toast("PIN iniziale aggiornato"); }
      catch (e) { toast(errMsg(e)); }
    };
    $("#lo").onclick = () => { S.adminPin = null; S.admin = null; home(); };
  }
}
async function adminUsers(ap) {
  ap.innerHTML = `<div class="card empty">Caricamento…</div>`;
  let users;
  try { users = (await rpc("quiz_admin_users", { p_pin: S.adminPin })) || []; }
  catch (e) { ap.innerHTML = `<div class="card empty">${esc(errMsg(e))}</div>`; return; }
  if (!ap.isConnected) return;
  const when = (d) => (d ? new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "mai");
  users.sort((a, b) => (Date.parse(b.last_seen) || 0) - (Date.parse(a.last_seen) || 0)); // il più recente in cima
  ap.innerHTML = `<p class="small muted">Ultimo accesso = ultima apertura dell'app con connessione. Da questa versione il PIN è obbligatorio, quindi compaiono tutti i corsisti man mano che aggiornano l'app. Risultati e voti sono privati e non si vedono qui.</p>
    ${users.length ? users.map((u) => `<div class="card"><div class="row"><b style="color:var(--text)">${esc(u.name)}</b><span class="spacer"></span>
      ${u.locked ? '<span class="tag lock">bloccato</span>' : ""}${u.must_change ? '<span class="tag val">deve scegliere il PIN</span>' : ""}</div>
      <div class="small muted" style="margin:6px 0">Ultimo accesso: ${when(u.last_seen)}</div>
      <div class="row end"><button class="btn secondary" data-reset="${esc(u.id)}" data-name="${esc(u.name)}">Azzera PIN</button></div></div>`).join("") : `<div class="card empty">Nessun corsista ha ancora fatto l'accesso con il PIN.</div>`}`;
  ap.onclick = async (e) => {
    const b = e.target.closest("[data-reset]"); if (!b) return;
    if (!confirm(`Azzerare il PIN di ${b.dataset.name}? Rientrerà con il PIN iniziale comune e ne sceglierà uno nuovo. I suoi dati restano.`)) return;
    try { await rpc("quiz_admin_reset_user_pin", { p_pin: S.adminPin, p_user_id: b.dataset.reset }); toast(`PIN di ${b.dataset.name} azzerato`); adminUsers(ap); }
    catch (err) { toast(errMsg(err)); }
  };
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
// Aggiornamento automatico: quando il service worker di una nuova versione prende il controllo, la pagina si ricarica
// (subito, o alla fine del quiz in corso).
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || S.reloadPending) return; // primo avvio: niente da ricaricare
    if (!S.inProgress && !$("#dlg").open) return location.reload();
    // quiz in corso: si aggiorna al ritorno alla home, oppure subito con il pulsante
    S.reloadPending = true;
    const bar = document.createElement("div");
    bar.className = "update-bar"; bar.setAttribute("role", "status");
    bar.innerHTML = `<span>Nuova versione disponibile</span><button class="btn">Aggiorna ora</button>`;
    bar.querySelector("button").onclick = () => { if (!S.inProgress || confirm("Aggiornare adesso? Il quiz in corso si interrompe (le risposte date restano nelle statistiche).")) location.reload(); };
    document.body.appendChild(bar);
  });
}
// Dopo un aggiornamento la home mostra una volta le novità (non al primo utilizzo in assoluto).
{
  const prev = store.get("version", null);
  if (prev !== CFG.appVersion) { if (prev || S.user) S.updatedFrom = prev || "precedente"; store.set("version", CFG.appVersion); }
}
if (S.user && S.questions.length) {
  home(); pingUser();
  if (navigator.onLine) loadQuestions(S.user.code).then(() => { if (S.stack.length <= 1 && S.stack[0]?.[0] === home) home(); }).catch((e) => { if (/codice_non_valido/.test(e.message)) login(); });
}
else login();

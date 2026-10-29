/* Auto Seidel – Seitenlogik: Navigation, Einblenden, Öffnungszeiten, Formular, KI-Assistent */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;

  /* ---------- Navigation: Hintergrund, sobald gescrollt wurde ---------- */
  const nav = document.getElementById("nav");
  const sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:40px;left:0;width:1px;height:1px;pointer-events:none";
  body.prepend(sentinel);
  new IntersectionObserver(([e]) => nav.classList.toggle("scrolled", !e.isIntersecting)).observe(sentinel);

  /* ---------- Einblenden ---------- */
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("rv"));
    el.style.transitionDelay = Math.min(sibs.indexOf(el), 5) * 70 + "ms";
    el.classList.add("in");
    io.unobserve(el);
  }), { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));

  // Google-Wert hochzählen
  const counter = document.querySelector("[data-count]");
  if (counter && !reduce) {
    const target = parseFloat(counter.dataset.count);
    counter.firstChild.nodeValue = "0,0";
    new IntersectionObserver(([e], obs) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 1400), v = target * (1 - Math.pow(1 - t, 3));
        counter.firstChild.nodeValue = v.toFixed(1).replace(".", ",");
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }).observe(counter);
  }

  /* ---------- Rezensionen: Laufband verdoppeln ---------- */
  const marquee = document.getElementById("marquee");
  if (marquee) [...marquee.children].forEach((c) => {
    const d = c.cloneNode(true);
    d.classList.add("dup");
    d.setAttribute("aria-hidden", "true");
    marquee.appendChild(d);
  });

  /* ---------- Öffnungszeiten: heute + offen/geschlossen ---------- */
  const SLOTS = { 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18], 6: [9, 13] };
  const now = new Date(), day = now.getDay(), h = now.getHours() + now.getMinutes() / 60;
  document.querySelector(`#hours tr[data-day="${day}"]`)?.classList.add("today");
  const status = document.getElementById("status");
  if (status) {
    const s = SLOTS[day], open = s && h >= s[0] && h < s[1];
    status.classList.add(open ? "open" : "closed");
    status.querySelector("b").textContent = open ? `Jetzt geöffnet, bis ${String(s[1]).padStart(2, "0")}:00 Uhr` : "Gerade geschlossen";
  }
  document.getElementById("year").textContent = now.getFullYear();

  /* ---------- Fahrzeug anfragen → Formular vorbereiten ---------- */
  const form = document.getElementById("anfrage");
  function goToForm(anliegen, text) {
    if (anliegen) form.querySelector(`input[name="anliegen"][value="${anliegen}"]`)?.click();
    if (text) { const m = form.querySelector("#f-msg"); if (!m.value.trim()) m.value = text; }
    form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  document.querySelectorAll("[data-car]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    goToForm("Fahrzeugkauf", `Ich interessiere mich für den ${a.dataset.car}.`);
  }));

  /* ---------- Formular ---------- */
  const msg = document.getElementById("formMsg");
  const check = (input) => {
    const field = input.closest(".field");
    let ok = input.type === "checkbox" ? input.checked : input.value.trim() !== "";
    if (input.type === "email" && input.value.trim()) ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
    if (!input.required && input.type !== "email") ok = true;
    if (!input.required && input.type === "email" && !input.value.trim()) ok = true;
    field.classList.toggle("invalid", !ok);
    return ok;
  };
  const inputs = [...form.querySelectorAll("input[required], input[type=email]")];
  inputs.forEach((i) => i.addEventListener(i.type === "checkbox" ? "change" : "blur", () => check(i)));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = inputs.filter((i) => !check(i));
    if (bad.length) { bad[0].focus(); return; }
    form.classList.add("sending");
    msg.className = "form-msg";
    try {
      const res = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form)).toString() });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      msg.textContent = "Danke, Ihre Anfrage ist angekommen. Wir melden uns so bald wie möglich.";
      msg.classList.add("ok");
    } catch {
      msg.textContent = "Das Senden hat leider nicht geklappt. Rufen Sie uns gern direkt an: 03774 24400.";
      msg.classList.add("fail");
    } finally {
      form.classList.remove("sending");
    }
  });

  /* ---------- KI-Chatbot ---------- */
  const fab = document.getElementById("chatFab"), log = document.getElementById("chatLog");
  const cform = document.getElementById("chatForm"), input = document.getElementById("chatInput"), send = document.getElementById("chatSend");
  const chips = document.getElementById("chatChips");
  const history = [];
  let busy = false, greeted = false;

  // Antworten, falls der KI-Dienst nicht erreichbar ist (z. B. lokale Vorschau ohne Schlüssel)
  const FAQ = [
    [/öffnungs|geöffnet|offen|uhrzeit|wann.*(auf|da)|samstag|sonntag/i, "Wir sind Montag bis Freitag von 08:00 bis 18:00 Uhr für Sie da, samstags von 09:00 bis 13:00 Uhr. Sonntags ist geschlossen."],
    [/tüv|dekra|hauptuntersuchung|\bhu\b|plakette|au\b|abgas/i, "TÜV und Dekra kommen zweimal pro Woche zu uns in die Werkstatt. Den nächsten freien Termin nennen wir Ihnen am Telefon unter 03774 24400 oder Sie schreiben uns über das Formular."],
    [/reifen|räder|felge|winter|sommer|platt|wuchten/i, "Ja, wir wechseln Reifen, wuchten aus und reparieren Reifenschäden. Für einen Termin rufen Sie am besten kurz an: 03774 24400."],
    [/unfall|karosserie|blech|delle|beule|richt|gutachter|versicherung/i, "Nach einem Unfall: Unfallstelle sichern, Polizei bei Personenschaden rufen, Fotos machen und die Versicherung informieren. Die Reparatur übernehmen wir, Unfallschäden richten wir auf dem Celette-Richtsystem."],
    [/scheibe|glas|steinschlag|riss/i, "Steinschläge reparieren wir, und wenn das nicht mehr geht, tauschen wir die Frontscheibe. Bei einem Riss im Sichtfeld sollten Sie nicht weiterfahren."],
    [/klima|kühl|desinfi|klimaanlage/i, "Den Klimaservice machen wir bei uns in der Werkstatt: prüfen, Kältemittel befüllen und bei Bedarf desinfizieren."],
    [/inspektion|wartung|service|öl|ölwechsel|filter/i, "Inspektionen machen wir für alle Marken und Typen, einschließlich aller Nebenarbeiten. Einen Ölwechsel empfehlen wir alle 10.000 km oder einmal im Jahr."],
    [/kauf|gebraucht|neuwagen|verkauf|bestand|fahrzeug|auto kaufen/i, "Wir handeln mit Neu- und Gebrauchtwagen. Den aktuellen Bestand nennen wir Ihnen am Telefon unter 03774 24400."],
    [/preis|kost|teuer|günstig|angebot|€|euro/i, "Die Kosten hängen vom Fahrzeug und vom Aufwand ab. Ein Angebot bekommen Sie telefonisch unter 03774 24400 oder über das Formular unten."],
    [/adresse|wo |anfahrt|parken|finde|bermsgrün|schwarzenberg/i, "Sie finden uns in der Gemeindestraße 23 in 08340 Schwarzenberg, Ortsteil Bermsgrün."],
    [/termin|anfrage|buchen|vereinbar|vorbeikommen|formular/i, "Einen Termin vereinbaren Sie am schnellsten telefonisch unter 03774 24400 oder über das Formular „Ihre Anfrage“ unten auf der Seite."],
    [/telefon|anruf|nummer|erreich|mail|fax/i, "Sie erreichen uns unter 03774 24400, Fax 03774 20263."],
  ];
  const offline = (q) => (FAQ.find(([re]) => re.test(q)) || [, "Das klären wir am besten persönlich. Rufen Sie uns gern an unter 03774 24400."])[1];

  function renderMsg(el, text) {
    el.replaceChildren();
    let list = null;
    for (const raw of text.replace(/\*\*/g, "").split(/\n+/)) {
      const line = raw.trim(); if (!line) continue;
      const m = line.match(/^[-•*]\s+(.*)/);
      if (m) {
        if (!list) { list = document.createElement("ul"); el.appendChild(list); }
        const li = document.createElement("li"); li.textContent = m[1]; list.appendChild(li);
      } else {
        list = null;
        const p = document.createElement("p"); p.textContent = line; el.appendChild(p);
      }
    }
  }
  function bubble(cls, text = "") {
    const el = document.createElement("div");
    el.className = "msg " + cls; el.textContent = text;
    log.appendChild(el); log.scrollTop = log.scrollHeight;
    return el;
  }
  const ANL = [
    [/tüv|dekra|hauptuntersuchung/i, "TÜV / Dekra"],
    [/reifen|räder|felge/i, "Reifen"],
    [/unfall|karosserie|blech|delle|beule/i, "Unfall / Karosserie"],
    [/scheibe|glas|steinschlag/i, "Glas"],
    [/klima/i, "Klima"],
    [/kauf|gebraucht|neuwagen|fahrzeug/i, "Fahrzeugkauf"],
    [/inspektion|wartung|öl/i, "Inspektion"],
  ];
  function cta(contexts) {
    let hit = null;
    for (const c of contexts) { hit = ANL.find(([re]) => re.test(c)); if (hit) break; }
    const box = document.createElement("div"); box.className = "msg-cta";
    box.innerHTML = '<a href="#kontakt">Termin anfragen</a><a href="tel:+49377424400">03774 24400</a>';
    box.querySelector('a[href="#kontakt"]').addEventListener("click", (e) => {
      e.preventDefault();
      toggle(false);
      goToForm(hit && hit[1]);
    });
    log.appendChild(box); log.scrollTop = log.scrollHeight;
  }
  function toggle(open) {
    body.classList.toggle("chat-open", open);
    fab.setAttribute("aria-expanded", open);
    if (open && !greeted) { greeted = true; bubble("bot", "Guten Tag! Ich beantworte Fragen zu Inspektion, Reifen, TÜV, Unfallreparatur, Fahrzeugkauf und Öffnungszeiten. Was kann ich für Sie tun?"); }
    if (open && matchMedia("(hover:hover)").matches) setTimeout(() => input.focus(), 250);
    if (!open) fab.focus({ preventScroll: true });
  }
  async function ask(q) {
    q = q.trim(); if (!q || busy) return;
    busy = true; send.disabled = true; chips.hidden = true;
    bubble("me", q); history.push({ role: "user", content: q });
    input.value = ""; input.style.height = "";
    const typing = bubble("bot typing"); typing.innerHTML = "<i></i><i></i><i></i>";
    let answer = "", el = null;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-16) }) });
      if (!res.ok || !res.body) throw new Error("offline");
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        answer += dec.decode(value, { stream: true });
        if (answer.includes("\u0000FEHLER")) throw new Error("offline");
        if (!el && answer.trim()) { typing.remove(); el = bubble("bot"); }
        if (el) { renderMsg(el, answer); log.scrollTop = log.scrollHeight; }
      }
      if (!answer.trim()) throw new Error("offline");
    } catch {
      answer = offline(q);
      typing.remove(); if (el) el.remove(); renderMsg(el = bubble("bot"), answer);
    }
    answer = answer.replace("\u0000FEHLER", "").trim();
    history.push({ role: "assistant", content: answer });
    if (/termin|anfrage|buchen|vereinbar|vorbeikommen|angebot|tüv|dekra/i.test(q) || /Formular/.test(answer)) cta(history.filter((m) => m.role === "user").map((m) => m.content).reverse());
    busy = false; send.disabled = !input.value.trim();
  }

  const hint = document.getElementById("botHint");
  const hideHint = () => { hint.classList.remove("show"); try { sessionStorage.setItem("botHint", "1"); } catch {} };
  let seen = false;
  try { seen = sessionStorage.getItem("botHint") === "1"; } catch {}
  // Begrüßung kurz zeigen und von selbst wieder ausblenden, damit sie nichts verdeckt
  if (!seen) setTimeout(() => {
    if (body.classList.contains("chat-open")) return;
    hint.classList.add("show");
    setTimeout(() => hint.classList.remove("show"), innerWidth < 600 ? 7000 : 12000);
  }, 2500);
  document.getElementById("botHintX").addEventListener("click", (e) => { e.stopPropagation(); hideHint(); });
  hint.addEventListener("click", () => { hideHint(); toggle(true); });
  fab.addEventListener("click", () => { hideHint(); toggle(true); });
  document.getElementById("chatClose").addEventListener("click", () => toggle(false));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && body.classList.contains("chat-open")) toggle(false); });
  chips.querySelectorAll(".chip-chat").forEach((c) => c.addEventListener("click", () => ask(c.textContent)));
  input.addEventListener("input", () => {
    send.disabled = busy || !input.value.trim();
    input.style.height = ""; input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  cform.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
})();

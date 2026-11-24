/* AZADOR core: طبقة البيانات المشتركة بين كل الصفحات.
   الآن تعمل على localStorage؛ لاحقاً نستبدل DB فقط بـ Firebase دون لمس الصفحات. */
const AZ = (() => {
  const ls = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
  const fmt = (t, l = "ar") => new Intl.DateTimeFormat(l === "ar" ? "ar-u-nu-latn" : l, { hour: "2-digit", minute: "2-digit" }).format(t);
  const cur = { ar: "دج", fr: "DA", en: "DA" }; // العملة: الدينار الجزائري
  const money = (n, l = "ar") => Math.round(n || 0).toLocaleString("en") + " " + cur[l];
  const paid = o => o.payments.reduce((a, x) => a + x.amount, 0);
  const waiting = o => { let c = 0; for (let i = o.messages.length - 1; i >= 0 && o.messages[i].from === "client"; i--) c++; return c; };
  // رابط آمن: "" فارغ، null غير صالح، وإلا http(s) فقط
  const url = u => { u = (u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null; };
  const copy = async t => {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) { const a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {} a.remove(); return ok; }
  };
  const ST = {
    new: { ar: "جديد", fr: "Nouveau", en: "New" },
    reviewing: { ar: "قيد المراجعة", fr: "En examen", en: "Reviewing" },
    quoted: { ar: "تم عرض السعر", fr: "Devis envoyé", en: "Quoted" },
    in_progress: { ar: "قيد التنفيذ", fr: "En cours", en: "In progress" },
    delivered: { ar: "تم التسليم", fr: "Livré", en: "Delivered" },
    closed: { ar: "مغلق", fr: "Clôturé", en: "Closed" }
  };
  const STAGES = ["new", "reviewing", "quoted", "in_progress", "delivered"];

  const KEY = "azador.orders", subs = new Set();
  const DB = {
    key: KEY,
    all() { try { return JSON.parse(ls(KEY)) || []; } catch (e) { return []; } },
    save(l) { ls(KEY, JSON.stringify(l)); subs.forEach(f => f()); },
    get(id) { return this.all().find(o => o.id === id); },
    newId() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return "AZD-" + Array.from({ length: 4 }, () => c[Math.random() * c.length | 0]).join(""); },
    create(o) {
      const l = this.all(); let id;
      do { id = this.newId(); } while (l.some(x => x.id === id));
      const ord = { id, status: "new", price: 0, payments: [], messages: [], createdAt: Date.now(), ...o };
      l.push(ord); this.save(l); return ord;
    },
    update(id, fn) { const l = this.all(), o = l.find(x => x.id === id); if (o) { fn(o); this.save(l); } },
    say(id, from, text) { this.update(id, o => { o.messages.push({ from, text, t: Date.now() }); }); },
    on(f) { subs.add(f); return () => subs.delete(f); }
  };
  addEventListener("storage", e => { if (e.key === KEY) subs.forEach(f => f()); }); // تحديث حيّ بين التبويبات

  /* مكوّن الشات المشترك: me = "client" | "admin" */
  const Chat = {
    mount(root, id, me, L) {
      root.innerHTML = (L.title ? `<div class="ch"><b>${esc(L.title)}</b><small>${esc(L.sub || "")}</small></div>` : "")
        + `<div class="msgs"></div><form class="composer"><textarea rows="1" placeholder="${esc(L.ph)}"></textarea><button class="btn pri" type="submit">${esc(L.send)}</button></form>`;
      const list = root.querySelector(".msgs"), ta = root.querySelector("textarea"), f = root.querySelector("form");
      let n = 0;
      const draw = () => {
        const o = DB.get(id); if (!o) return;
        const ms = o.messages;
        if (ms.length < n) n = 0;
        if (!ms.length) { list.innerHTML = `<p class="empty">${esc(L.empty)}</p>`; return; }
        if (n === 0) list.innerHTML = "";
        ms.slice(n).forEach(m => {
          const d = document.createElement("div"), tm = `<time>${fmt(m.t, L.lang)}</time>`;
          d.className = "msg " + (m.from === me ? "me" : "them") + (m.kind ? " lk" : "");
          if (m.kind) { // رسالة رابط: ديمو أو الموقع النهائي
            const fin = m.kind === "final", u = esc(m.url);
            d.innerHTML = `<div class="lkc"><b>${esc(fin ? L.finalMsg : L.demoMsg)}</b><code dir="ltr">${u}</code><div class="lka"><a class="btn gh sm" href="${u}" target="_blank" rel="noopener">${esc(L.open)}</a>`
              + (fin ? `<button type="button" class="btn pri sm" data-copy="${u}" data-t="${esc(L.copy)}" data-ok="${esc(L.copied)}" data-f="${esc(L.copyFail)}" aria-live="polite">${esc(L.copy)}</button>` : "") + `</div></div>${tm}`;
          } else { d.innerHTML = `<p></p>${tm}`; d.firstChild.textContent = m.text; }
          list.append(d);
        });
        n = ms.length; list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      };
      f.onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ""; ta.style.height = ""; DB.say(id, me, t); };
      ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
      ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; };
      const off = DB.on(draw); draw(); return off;
    }
  };

  const Theme = {
    init() { const r = document.documentElement; if (ls("mode")) r.dataset.theme = ls("mode"); if (ls("primary")) r.style.setProperty("--primary", ls("primary")); },
    toggle() { const r = document.documentElement, n = r.dataset.theme === "light" ? "dark" : "light"; r.classList.add("theming"); r.dataset.theme = n; ls("mode", n); setTimeout(() => r.classList.remove("theming"), 600); },
    primary(v) { document.documentElement.style.setProperty("--primary", v); ls("primary", v); }
  };
  Theme.init();

  document.addEventListener("click", e => { // زر النسخ العام (يعمل في الشات وصفحة المتابعة)
    const b = e.target.closest("[data-copy]"); if (!b) return;
    copy(b.dataset.copy).then(ok => {
      b.textContent = ok ? b.dataset.ok : b.dataset.f; b.classList.toggle("done", ok);
      clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = b.dataset.t; b.classList.remove("done"); }, 2200);
    });
  });

  return { ls, esc, fmt, cur, money, paid, waiting, url, copy, ST, STAGES, DB, Chat, Theme };
})();

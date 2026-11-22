(() => {
  const TZ = "Asia/Taipei";
  const KEY = "nfc-switch-demo-v1";
  const LABELS = {
    wallet: "錢包（門禁）",
    google: "Google 錢包（付款）",
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const phone = $("#app");
  const status = $("#status");
  const toastEl = $("#toast");
  const notif = $("#notif");
  const qs = $("#screen-qs");
  const screens = {
    home: $("#screen-home"),
    pay: $("#screen-pay"),
    nfc: $("#screen-nfc"),
    app: $("#screen-app"),
  };

  const state = load() || {
    last: null,          // 'wallet' | 'google' | null
    nfcOn: true,
    lockPay: false,
    remind: false,
    mins: 15,
  };

  let toastTimer = 0;
  let remindTimer = 0;
  let stack = ["home"];
  let applyingHash = false;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }

  function taipeiNow() {
    const parts = new Intl.DateTimeFormat("zh-Hant-TW", {
      timeZone: TZ,
      weekday: "long",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return {
      hm: `${get("hour")}:${get("minute")}`,
      date: `${get("month")}月${get("day")}日 ${get("weekday")}`,
    };
  }

  function tickClock() {
    const t = taipeiNow();
    $$("[data-clock]").forEach((el) => {
      const kind = el.getAttribute("data-clock");
      if (kind === "hm") el.textContent = t.hm;
      if (kind === "date") el.textContent = t.date;
    });
  }

  function lastText() {
    return state.last ? LABELS[state.last] : "尚未選擇";
  }

  function renderLast() {
    $$("[data-last-label]").forEach((el) => {
      el.textContent = lastText();
      el.classList.toggle("is-wallet", state.last === "wallet");
      el.classList.toggle("is-google", state.last === "google");
    });
    $$("[data-pick]").forEach((el) => {
      const on = el.getAttribute("data-pick") === state.last;
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function renderNfc() {
    const on = state.nfcOn;
    $("#nfc-switch").classList.toggle("on", on);
    $("#nfc-switch").setAttribute("aria-checked", String(on));
    $("#nfc-state-label").textContent = on ? "已開啟" : "已關閉";
    $("#app-nfc-label").textContent = on ? "已開啟" : "已關閉，刷卡前請先打開";
    $("#nfc-card").classList.toggle("is-off", !on);
    const qsNfc = $("#qs-nfc");
    qsNfc.classList.toggle("on", on);
  }

  function renderLock() {
    $("#lock-switch").classList.toggle("on", state.lockPay);
    $("#lock-switch").setAttribute("aria-checked", String(state.lockPay));
  }

  function renderRemind() {
    $("#remind-switch").classList.toggle("on", state.remind);
    $("#remind-switch").setAttribute("aria-checked", String(state.remind));
    $("#mins-wrap").hidden = !state.remind;
    $$("[data-mins]").forEach((el) => {
      el.classList.toggle("on", Number(el.getAttribute("data-mins")) === state.mins);
    });
  }

  function topScreen() {
    return stack[stack.length - 1];
  }

  function setStatusStyle() {
    const dark = topScreen() !== "home" || !qs.hidden;
    status.classList.toggle("is-light", !dark);
    status.classList.toggle("is-dark", dark);
  }

  function showScreen(name, opts = {}) {
    const { push = true, replace = false } = opts;
    if (name !== "home") closeQs(true);
    if (name === "home") {
      stack = ["home"];
      Object.entries(screens).forEach(([key, el]) => {
        el.classList.toggle("is-on", key === "home");
      });
    } else {
      if (replace && stack.length) stack[stack.length - 1] = name;
      else if (push && topScreen() !== name) stack.push(name);
      Object.entries(screens).forEach(([key, el]) => {
        if (key === "home") return;
        el.classList.toggle("is-on", key === name);
      });
      screens.home.classList.add("is-on");
    }
    setStatusStyle();
    if (!applyingHash) syncHash();
  }

  function goBack() {
    if (!qs.hidden) {
      closeQs();
      return;
    }
    if (stack.length <= 1) {
      showScreen("home");
      return;
    }
    stack.pop();
    showScreen(topScreen(), { push: false });
  }

  function openQs() {
    if (topScreen() !== "home") return;
    hideNotif();
    qs.hidden = false;
    setStatusStyle();
    if (!applyingHash) syncHash();
  }

  function closeQs(silent) {
    if (qs.hidden) return;
    qs.hidden = true;
    setStatusStyle();
    if (!silent && !applyingHash) syncHash();
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function hideNotif() {
    notif.hidden = true;
  }

  function showNotif() {
    closeQs(true);
    notif.hidden = false;
  }

  function armRemindPreview() {
    clearTimeout(remindTimer);
    if (!state.remind || state.last !== "google") return;
    remindTimer = setTimeout(() => {
      if (state.remind && state.last === "google") {
        toast(`示範：實際使用會在 ${state.mins} 分鐘後提醒你切回門禁`);
        showNotif();
        if (!applyingHash) syncHash();
      }
    }, 1800);
  }

  function pick(which) {
    const prev = state.last;
    state.last = which;
    save();
    renderLast();
    toast(which === "wallet" ? "已記下上次選擇：錢包（門禁）" : "已記下上次選擇：Google 錢包（付款）");
    if (which === "google" && state.remind) armRemindPreview();
    if (which === "wallet") {
      clearTimeout(remindTimer);
      hideNotif();
    }
    // return after a short beat so the radio state is visible
    setTimeout(() => goBack(), prev === which ? 180 : 320);
  }

  function setNfc(on) {
    state.nfcOn = on;
    save();
    renderNfc();
  }

  function parseHash() {
    const h = (location.hash || "#/home").replace(/^#\/?/, "");
    const name = h.split("?")[0] || "home";
    return name;
  }

  function syncHash() {
    let name = topScreen();
    if (!qs.hidden) name = "qs";
    if (!notif.hidden && name === "home") name = "notify";
    const next = `#/${name}`;
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function applyHash() {
    applyingHash = true;
    const name = parseHash();
    hideNotif();
    closeQs(true);
    if (name === "qs") {
      showScreen("home");
      qs.hidden = false;
      setStatusStyle();
    } else if (name === "notify") {
      showScreen("home");
      showNotif();
    } else if (name === "pay") {
      showScreen("home");
      showScreen("pay");
    } else if (name === "nfc") {
      showScreen("home");
      showScreen("app");
      showScreen("nfc");
    } else if (name === "app") {
      showScreen("home");
      showScreen("app");
    } else {
      showScreen("home");
    }
    applyingHash = false;
  }

  // events
  status.addEventListener("click", () => {
    if (topScreen() === "home" && qs.hidden) openQs();
  });

  $$("[data-close-qs]").forEach((el) => el.addEventListener("click", () => closeQs()));

  $$("[data-open-pay]").forEach((el) => {
    el.addEventListener("click", () => {
      closeQs(true);
      hideNotif();
      showScreen("pay");
    });
  });

  $$("[data-open-app]").forEach((el) => {
    el.addEventListener("click", () => {
      hideNotif();
      showScreen("app");
    });
  });

  $$("[data-open-nfc]").forEach((el) => {
    el.addEventListener("click", () => showScreen("nfc"));
  });

  $$("[data-back]").forEach((el) => el.addEventListener("click", goBack));

  $$("[data-pick]").forEach((el) => {
    el.addEventListener("click", () => pick(el.getAttribute("data-pick")));
  });

  $$("[data-deco]").forEach((el) => {
    el.addEventListener("click", () => {
      toast("這是示範桌面，只有「NFC 付款切換」可以點");
    });
  });

  $$("[data-qs-toggle]").forEach((el) => {
    el.addEventListener("click", () => el.classList.toggle("on"));
  });

  $("#qs-nfc").addEventListener("click", () => setNfc(!state.nfcOn));
  $("#nfc-switch").addEventListener("click", () => setNfc(!state.nfcOn));
  $("#lock-switch").addEventListener("click", () => {
    state.lockPay = !state.lockPay;
    save();
    renderLock();
  });
  $("#remind-switch").addEventListener("click", () => {
    state.remind = !state.remind;
    save();
    renderRemind();
    if (!state.remind) {
      clearTimeout(remindTimer);
      hideNotif();
    }
  });
  $$("[data-mins]").forEach((el) => {
    el.addEventListener("click", () => {
      state.mins = Number(el.getAttribute("data-mins"));
      save();
      renderRemind();
    });
  });
  $("#btn-preview-notif").addEventListener("click", () => {
    showScreen("home");
    toast(`示範通知：實際使用會在 ${state.mins} 分鐘後出現`);
    showNotif();
    syncHash();
  });
  $("#notif-btn").addEventListener("click", () => {
    hideNotif();
    showScreen("pay");
  });

  // swipe down from the top of the home screen to open QS
  let startY = null;
  phone.addEventListener("pointerdown", (e) => {
    if (topScreen() !== "home" || !qs.hidden) return;
    const r = phone.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < 64) startY = e.clientY;
  });
  phone.addEventListener("pointerup", (e) => {
    if (startY == null) return;
    if (e.clientY - startY > 36) openQs();
    startY = null;
  });
  phone.addEventListener("pointercancel", () => { startY = null; });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") goBack();
  });

  window.addEventListener("hashchange", applyHash);

  if (new URLSearchParams(location.search).has("shot")) {
    document.documentElement.classList.add("shot");
  }

  tickClock();
  setInterval(tickClock, 1000);
  renderLast();
  renderNfc();
  renderLock();
  renderRemind();
  applyHash();
})();

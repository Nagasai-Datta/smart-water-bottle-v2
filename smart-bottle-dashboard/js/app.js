// ════════════════════════════════════════════════════════════════
//  Smart Bottle Dashboard — app.js  (v3.1 — integration-tested)
//
//  ⚠  Change FIREBASE_DB_URL to your own Firebase project URL.
//     It appears only once below.
// ════════════════════════════════════════════════════════════════

const FIREBASE_DB_URL =
  "https://smart-bottle-iot-default-rtdb.asia-southeast1.firebasedatabase.app/";

if (typeof firebase === "undefined") {
  console.error("Firebase SDK not loaded!");
} else {
  firebase.initializeApp({ databaseURL: FIREBASE_DB_URL });
}
const db = firebase.database ? firebase.database() : null;

// ── DOM refs ───────────────────────────────────────────────────────
const elTemp      = document.getElementById("temp");
const elSetpoint  = document.getElementById("setpoint");
const elMode      = document.getElementById("mode");
const elHeater    = document.getElementById("heater");
const elCooler    = document.getElementById("cooler");
const elPidOut    = document.getElementById("pidOutput");
const elError     = document.getElementById("errorVal");
const statusDot   = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const logEl       = document.getElementById("log");
const spSlider    = document.getElementById("spSlider");
const spDisplay   = document.getElementById("spDisplay");
const pushSpBtn   = document.getElementById("pushSpBtn");
const kpSlider    = document.getElementById("kpSlider");
const kiSlider    = document.getElementById("kiSlider");
const kdSlider    = document.getElementById("kdSlider");
const kpVal       = document.getElementById("kpVal");
const kiVal       = document.getElementById("kiVal");
const kdVal       = document.getElementById("kdVal");
const pushPidBtn  = document.getElementById("pushPidBtn");
const schedToggle = document.getElementById("schedToggle");
const schedState  = document.getElementById("schedState");
const schedGrid   = document.getElementById("scheduleGrid");
const nextEvent   = document.getElementById("nextEvent");
const gaugeArc    = document.getElementById("gaugeArc");
const setTick     = document.getElementById("setTick");
const heaterCard  = document.getElementById("heaterCard");
const coolerCard  = document.getElementById("coolerCard");
const clockEl     = document.getElementById("clock");
const atBanner    = document.getElementById("atBanner");
const atMsg       = document.getElementById("atMsg");
const elSipCount  = document.getElementById("sipCount");
const sipProgress = document.getElementById("sipProgress");
const sipPct      = document.getElementById("sipPct");
const elLastSip   = document.getElementById("lastSip");
const goalInput   = document.getElementById("goalInput");
const goalValSpan = document.getElementById("goalVal");  // FIX: keep in sync with input

// ── Clock ─────────────────────────────────────────────────────────
const tickClock = () => (clockEl.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false }));
setInterval(tickClock, 1000); tickClock();

// ── Log ───────────────────────────────────────────────────────────
function log(msg, level = "ok") {
  const ts  = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const div = document.createElement("div");
  div.className = `entry ${level}`;
  div.innerHTML = `<span class="ts">${ts}</span>${msg}`;
  logEl.prepend(div);
  if (logEl.children.length > 50) logEl.lastElementChild.remove();
}

// ── Gauge ─────────────────────────────────────────────────────────
const ARC_LEN = 283, T_MIN = 5, T_MAX = 85;
function setGaugeTemp(t) {
  const p = Math.max(0, Math.min(1, (t - T_MIN) / (T_MAX - T_MIN)));
  gaugeArc.setAttribute("stroke-dasharray", `${(p * ARC_LEN).toFixed(1)} ${ARC_LEN}`);
  gaugeArc.setAttribute("stroke",
    p < 0.35 ? "#00bfff" : p < 0.55 ? "#00e5c8" : p < 0.75 ? "#ffb340" : "#ff4560");
}
function setGaugeSP(sp) {
  const p = Math.max(0, Math.min(1, (sp - T_MIN) / (T_MAX - T_MIN)));
  setTick.setAttribute("transform", `rotate(${-180 + p * 180},110,120)`);
}

// ── Temperature history chart ─────────────────────────────────────
const HIST = 60;
const hLabels = [], hTemps = [], hSPs = [];
const tempCtx = document.getElementById("tempChart").getContext("2d");
const tempChart = new Chart(tempCtx, {
  type: "line",
  data: {
    labels: hLabels,
    datasets: [
      { label: "Temp",     data: hTemps, borderColor: "#00e5c8", backgroundColor: "rgba(0,229,200,.06)", borderWidth: 2, pointRadius: 0, tension: .35, fill: true  },
      { label: "Setpoint", data: hSPs,   borderColor: "#ffb340", borderDash: [5,3],                      borderWidth: 1.5, pointRadius: 0, tension: 0,  fill: false },
    ],
  },
  options: {
    responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
    scales: {
      x: { ticks: { color: "#446666", font: { family: "Share Tech Mono", size: 10 }, maxTicksLimit: 6 }, grid: { color: "rgba(15,48,48,.8)" } },
      y: { ticks: { color: "#446666", font: { family: "Share Tech Mono", size: 10 }, callback: v => v + "°" }, grid: { color: "rgba(15,48,48,.8)" }, suggestedMin: 10, suggestedMax: 80 },
    },
    plugins: { legend: { labels: { color: "#b8d8d8", font: { family: "Share Tech Mono", size: 11 } } } },
  },
});
let lastChartTs = null;
function pushHistory(temp, sp, ts) {
  if (ts === lastChartTs) return;
  lastChartTs = ts;
  hLabels.push(new Date().toLocaleTimeString("en-GB", { hour12: false }));
  hTemps.push(+temp.toFixed(1));
  hSPs.push(+sp.toFixed(1));
  if (hLabels.length > HIST) { hLabels.shift(); hTemps.shift(); hSPs.shift(); }
  tempChart.update("none");
}

// ── Sip hourly bar chart ──────────────────────────────────────────
const SIP_HOURS  = 24;
const sipBuckets = new Array(SIP_HOURS).fill(0);
const sipLabels  = Array.from({ length: SIP_HOURS }, (_, i) => `${String(i).padStart(2, "0")}h`);
const sipCtx = document.getElementById("sipChart").getContext("2d");
const sipChart = new Chart(sipCtx, {
  type: "bar",
  data: {
    labels: sipLabels,
    datasets: [{ label: "Sips", data: sipBuckets, backgroundColor: "rgba(0,191,255,.5)", borderColor: "#00bfff", borderWidth: 1, borderRadius: 2 }],
  },
  options: {
    responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
    scales: {
      x: { ticks: { color: "#446666", font: { family: "Share Tech Mono", size: 9 }, maxTicksLimit: 8 }, grid: { color: "rgba(15,48,48,.8)" } },
      y: { ticks: { color: "#446666", font: { family: "Share Tech Mono", size: 9 }, stepSize: 1 }, grid: { color: "rgba(15,48,48,.8)" }, beginAtZero: true },
    },
    plugins: { legend: { display: false } },
  },
});
function recordSipNow() {
  sipBuckets[new Date().getHours()]++;
  sipChart.update("none");
}

// ── Hydration tracker ─────────────────────────────────────────────
let sipCount = 0;

// FIX: lastSipUptimeS + deviceUptimeS → elapsed time since last sip
// (ESP32 has no RTC; firmware sends boot-relative seconds, not unix time)
function formatElapsed(lastUptimeS, deviceUptimeS) {
  if (!lastUptimeS) return "—";
  if (!deviceUptimeS) return "unknown";      // guard: both fields sent together but be safe
  const elapsedS = Math.max(0, deviceUptimeS - lastUptimeS);
  if (elapsedS < 60)   return `${elapsedS}s ago`;
  if (elapsedS < 3600) return `${Math.floor(elapsedS / 60)}m ago`;
  return `${Math.floor(elapsedS / 3600)}h ago`;
}

function updateHydration(count, lastUptimeS, deviceUptimeS) {
  const goal = parseInt(goalInput.value) || 8;
  // FIX: keep the goalVal span in sync with the input
  goalValSpan.textContent = goal;
  sipCount = count;
  elSipCount.textContent = count;
  const pct = Math.min(100, Math.round(count / goal * 100));
  sipProgress.style.width = pct + "%";
  sipPct.textContent = pct + "%";
  elLastSip.textContent = "Last sip: " + formatElapsed(lastUptimeS, deviceUptimeS);
}

// FIX: re-run hydration update when goal changes so % and span both refresh
goalInput.addEventListener("input", () => updateHydration(sipCount, null, null));

// ── Stats listener ────────────────────────────────────────────────
if (db) {
  db.ref("bottle/stats").on("value", snap => {
    const s = snap.val();
    if (!s) return;
    updateHydration(
      s.sipCountToday    || 0,
      s.lastSipUptimeS   || null,
      s.deviceUptimeS    || null
    );
  });
}

// ── Auto-tune banner ──────────────────────────────────────────────
let prevAutoTuning = false;
function updateAutoTuneBanner(isActive, kp, ki, kd) {
  if (isActive) {
    atBanner.className = "autotune-banner tuning";
    atMsg.textContent  = "AUTO-TUNING IN PROGRESS — relay oscillating to find optimal gains…";
  } else if (prevAutoTuning && !isActive) {
    atBanner.className = "autotune-banner done";
    atMsg.textContent  = `AUTO-TUNE COMPLETE ✓  New gains → Kp=${kp}  Ki=${ki}  Kd=${kd}`;
    setTimeout(() => {
      atBanner.className = "autotune-banner";
      atMsg.textContent  = "AUTO-TUNE IDLE — Hold OK on device (>2 s) to start";
    }, 10000);
  }
  prevAutoTuning = isActive;
}

// ── Status ────────────────────────────────────────────────────────
function setStatus(live, msg) {
  statusDot.className  = "status-dot" + (live === true ? " live" : live === false ? " error" : "");
  statusLabel.textContent = msg;
}

// ── Telemetry listener ────────────────────────────────────────────
if (db) {
  setStatus(null, "CONNECTING");
  log("Connecting to Firebase…", "warn");

  db.ref("bottle/telemetry").on("value", snap => {
    const d = snap.val();
    if (!d) { setStatus(false, "NO DATA"); return; }
    setStatus(true, "LIVE");

    const temp     = parseFloat(d.temperature) || 0;
    const sp       = parseFloat(d.setpoint)    || 0;
    const pid      = parseFloat(d.pidOutput)   || 0;
    const err      = +(sp - temp).toFixed(2);
    const isTuning = !!d.autoTuning;
    const sipNow   = !!d.sipDetected;

    elTemp.textContent = temp.toFixed(1);
    setGaugeTemp(temp); setGaugeSP(sp);

    elSetpoint.textContent = sp.toFixed(1);
    elPidOut.textContent   = pid.toFixed(1);
    elMode.textContent     = (d.mode || "--").toUpperCase();
    elError.textContent    = (err >= 0 ? "+" : "") + err;
    elError.style.color    = Math.abs(err) > 5 ? "var(--red)" : Math.abs(err) > 1 ? "var(--amber)" : "var(--accent)";

    const hOn = !!d.heater, cOn = !!d.cooler;
    elHeater.textContent = hOn ? "ON" : "OFF";
    elCooler.textContent = cOn ? "ON" : "OFF";
    heaterCard.className = "actuator" + (hOn ? " active-heat" : "");
    coolerCard.className = "actuator" + (cOn ? " active-cool" : "");

    // PID slider sync (only when not being manually dragged)
    if (d.Kp && document.activeElement !== kpSlider) { kpSlider.value = d.Kp; kpVal.textContent = (+d.Kp).toFixed(2); }
    if (d.Ki && document.activeElement !== kiSlider) { kiSlider.value = d.Ki; kiVal.textContent = (+d.Ki).toFixed(3); }
    if (d.Kd && document.activeElement !== kdSlider) { kdSlider.value = d.Kd; kdVal.textContent = (+d.Kd).toFixed(2); }

    updateAutoTuneBanner(isTuning, (+d.Kp).toFixed(2), (+d.Ki).toFixed(3), (+d.Kd).toFixed(2));

    if (sipNow) {
      recordSipNow();
      log(`💧 Sip detected! T=${temp.toFixed(1)}°C`, "sip");
    }

    pushHistory(temp, sp, d.ts);

    // Sync setpoint slider only when not being manually dragged
    if (document.activeElement !== spSlider) {
      spSlider.value = sp;
      spDisplay.textContent = sp.toFixed(1) + " °C";
    }

    log(`T=${temp.toFixed(1)}°C  SP=${sp.toFixed(1)}°C  PID=${pid.toFixed(1)}  ${hOn ? "HEAT" : ""}${cOn ? "COOL" : ""}${isTuning ? "  [TUNING]" : ""}`, "ok");
  }, e => {
    setStatus(false, "ERROR");
    log("Listener error: " + e.message, "err");
  });
} else {
  setStatus(false, "SDK ERROR");
  log("Firebase SDK not initialised.", "err");
}

// ── Setpoint slider ───────────────────────────────────────────────
spSlider.addEventListener("input", () => {
  spDisplay.textContent = (+spSlider.value).toFixed(1) + " °C";
});
pushSpBtn.addEventListener("click", () => {
  if (!db) return;
  const v = +spSlider.value;
  db.ref("bottle/control").update({ setpoint: v })
    .then(() => log(`Setpoint pushed: ${v}°C`, "ok"))
    .catch(e => log("Setpoint push failed: " + e.message, "err"));
});

// ── PID sliders ───────────────────────────────────────────────────
kpSlider.addEventListener("input", () => (kpVal.textContent = (+kpSlider.value).toFixed(2)));
kiSlider.addEventListener("input", () => (kiVal.textContent = (+kiSlider.value).toFixed(3)));
kdSlider.addEventListener("input", () => (kdVal.textContent = (+kdSlider.value).toFixed(2)));
pushPidBtn.addEventListener("click", () => {
  if (!db) return;
  const p = {
    Kp: +parseFloat(kpSlider.value).toFixed(3),
    Ki: +parseFloat(kiSlider.value).toFixed(4),
    Kd: +parseFloat(kdSlider.value).toFixed(3),
  };
  db.ref("bottle/control/pid").set(p)
    .then(() => log(`PID pushed: Kp=${p.Kp} Ki=${p.Ki} Kd=${p.Kd}`, "ok"))
    .catch(e => log("PID push failed: " + e.message, "err"));
});

// ── Smart Scheduler ───────────────────────────────────────────────
const DEFAULT_SLOTS = [
  { name: "MORNING COFFEE",  startHour:  6, startMin: 0, temp: 70 },
  { name: "MID-MORNING",     startHour:  9, startMin: 0, temp: 55 },
  { name: "AFTERNOON WATER", startHour: 13, startMin: 0, temp: 15 },
  { name: "EVENING TEA",     startHour: 17, startMin: 0, temp: 65 },
  { name: "NIGHT",           startHour: 21, startMin: 0, temp: 10 },
];
let schedEnabled = false, scheduleSlots = [...DEFAULT_SLOTS];
const padZ = n => String(n).padStart(2, "0");

function getActiveSlot() {
  const mins = new Date().getHours() * 60 + new Date().getMinutes();
  let a = 0;
  scheduleSlots.forEach((s, i) => { if (mins >= s.startHour * 60 + s.startMin) a = i; });
  return a;
}

function renderSchedule() {
  const ai = getActiveSlot();
  schedGrid.innerHTML = "";
  scheduleSlots.forEach((slot, i) => {
    const div = document.createElement("div");
    div.className = "sched-slot" + (i === ai ? " active-slot" : "");
    div.innerHTML = `
      <div>
        <div class="slot-name">${slot.name}</div>
        <div class="slot-time">${padZ(slot.startHour)}:${padZ(slot.startMin)}</div>
      </div>
      <input type="number" min="5" max="85" value="${slot.temp}" data-idx="${i}"
             style="width:52px;background:var(--surface);border:1px solid var(--border);
                    color:var(--text);font-family:var(--font-mono);font-size:.7rem;
                    padding:.2rem .3rem;border-radius:3px;" />
      <div class="slot-temp">${slot.temp}°</div>`;
    div.querySelector("input").addEventListener("change", e => {
      scheduleSlots[+e.target.dataset.idx].temp = +e.target.value;
      renderSchedule();
    });
    schedGrid.appendChild(div);
  });
  const ns = scheduleSlots[(getActiveSlot() + 1) % scheduleSlots.length];
  nextEvent.textContent = `NEXT: ${ns.name} @ ${padZ(ns.startHour)}:${padZ(ns.startMin)} → ${ns.temp}°C`;
}

function tickSchedule() {
  renderSchedule();
  if (!schedEnabled || !db) return;
  const ai   = getActiveSlot(), slot = scheduleSlots[ai];
  const now  = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  if (nowM === slot.startHour * 60 + slot.startMin && now.getSeconds() < 60) {
    db.ref("bottle/control").update({ setpoint: slot.temp })
      .then(() => log(`SCHEDULE: "${slot.name}" → ${slot.temp}°C`, "warn"))
      .catch(e => log("Schedule push failed: " + e.message, "err"));
  }
}

schedToggle.addEventListener("change", () => {
  schedEnabled = schedToggle.checked;
  schedState.textContent = schedEnabled ? "ON" : "OFF";
  log(`Schedule ${schedEnabled ? "enabled" : "disabled"}`, schedEnabled ? "ok" : "warn");
  if (schedEnabled) tickSchedule();
});

renderSchedule();
setInterval(tickSchedule, 60_000);

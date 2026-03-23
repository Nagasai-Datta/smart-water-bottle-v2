# Smart Water Bottle — IoT Thermal Control System

> ESP32 · Firebase Realtime Database · PID Control · Auto-Tuning · Sip Detection

---

## ★★★ NOVEL CONTRIBUTIONS ★★★

> This section documents the three features that go beyond standard IoT coursework.
> All three are academically citable, require no additional hardware, and are implemented from first principles.

---

### ① Relay Auto-Tuning Inspired by Åström & Hägglund (1984)

**What it is:**
Selecting PID gains (Kp, Ki, Kd) normally requires manual trial-and-error or a full system model.
This project includes a relay-based auto-tuning routine on the ESP32, without any extra hardware.

**How it works:**

```
1. Long-press the OK button (>2 s) to trigger
2. Firmware replaces the PID with a bang-bang relay (full heat ↔ full cool)
3. The closed loop oscillates around an internal reference temperature
4. The firmware tracks relay crossings and timing over 6 half-cycles
5. It computes updated PID gains using a Ziegler-Nichols-style calculation
6. Applies:
       Kp = 0.60 × Ku
       Ki = 1.20 × Ku / Tu
       Kd = 0.075 × Ku × Tu
7. Pushes the new gains to Firebase immediately and resumes PID control
```

The OLED shows "** AUTO-TUNING **" with a live crossing counter. The web dashboard banner pulses amber during tuning and turns green on completion, displaying the computed values.

**Why it is novel:**
It brings relay-based PID retuning into a small ESP32 demo without requiring extra hardware or reflashing. The firmware also includes a first-order thermal lag model so the simulation can produce visible oscillatory behaviour during tuning.

**Reference:**
> Åström, K. J. & Hägglund, T. (1984).
> *Automatic tuning of simple regulators with specifications on phase and amplitude margins.*
> Automatica, 20(5), 645–651.

---

### ② Sip Detection — Zero Extra Hardware

**What it is:**
The system infers drinking events purely from the existing temperature signal, with no accelerometer, no flow sensor, no capacitive sensor.

**How it works:**
A sudden temperature drop greater than **1.8 °C** per measurement cycle is the thermal fingerprint of a sip: cold liquid is introduced, or the bottle is tilted and the probe briefly contacts ambient air.

```cpp
// Real hardware detection (main.cpp, detectSip())
if (prevMeasTemp > 0 && (prevMeasTemp - meas) > SIP_DROP_THRESHOLD)
    → sip detected, sipCountToday++, push to Firebase
```

In simulation mode, sip events are generated stochastically (~0.3% per cycle) for demo purposes.

Detected sips are pushed to `bottle/stats` in Firebase. The dashboard shows:
- Total sips today with a goal progress bar
- An hourly bar chart for sip events seen during the current dashboard session
- Time elapsed since last sip

**Why it is novel:**
Hydration tracking products (HidrateSpark, Thermos Smart Lid) use dedicated sensors. This implementation achieves the same result from the control signal that already exists — zero BOM cost.

---

### ③ PID Controller with Anti-Windup, Deadband, and Tunable Gains

**What it is:**
The original project used a two-state bang-bang controller (`if error > 0.5: heater ON`). This is replaced with a discrete-time PID with three practical features:

| Feature | What it prevents |
|---|---|
| Integral anti-windup (±50 clamp) | Integrator saturation during large errors causing large overshoot |
| Derivative on error delta | Faster response to changing error, with the usual tradeoff that setpoint steps can create a D-term spike |
| Deadband reset (±0.3 °C) | Integrator drift / actuator hunting when settled at target |

PID gains are readable and writable via Firebase — the dashboard has live Kp/Ki/Kd sliders that push to `bottle/control/pid`, and the firmware reads them every 5 seconds without reflashing.

---

## How to Run — Complete Runbook

### What you need to change: ONE thing only

**Firebase URL appears in exactly 2 files:**

```
smart-water-bottle/src/main.cpp   → line 44:  const String FB_BASE = "https://YOUR-URL..."
smart-bottle-dashboard/js/app.js  → line 7:   const FIREBASE_DB_URL = "https://YOUR-URL..."
```

Replace both with your own Firebase Realtime Database URL. Nothing else changes.

---

### Step 1 — Firebase setup (5 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project → Enable **Realtime Database** (start in test mode)
3. In the database, create this path manually and set it to `50`:
   ```
   bottle → control → setpoint = 50
   ```
4. Copy your database URL. It looks like:
   ```
   https://<project-id>-default-rtdb.<region>.firebasedatabase.app
   ```
5. Paste it into both files listed above (no trailing slash needed in the firmware string)

---

### Step 2 — Firmware (Wokwi simulation — no physical hardware needed)

**Prerequisites (install once):**
- [VS Code](https://code.visualstudio.com/)
- [PlatformIO extension](https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide) — installs from VS Code Extensions panel
- [Wokwi extension](https://marketplace.visualstudio.com/items?itemName=wokwi.wokwi-vscode) — same place

> **What is PlatformIO?** It's a VS Code plugin that handles the Arduino build system for you — compiler, libraries, everything. You never touch the command line for the firmware.

**Steps:**
1. Open VS Code → **File → Open Folder** → select the `smart-water-bottle/` folder (the inner one, not the repo root)
2. PlatformIO will show a toolbar at the bottom of VS Code. Click **Build** (✓ checkmark icon). It downloads all libraries automatically on first build.
3. Once "Success" appears, click the **Wokwi** icon in the left sidebar and press play ▶
4. The virtual ESP32, OLED, DS18B20, and buttons appear. Serial Monitor opens at 115200 baud showing JSON telemetry.
5. Watch the OLED show temperature converging toward the setpoint.

**Button controls in Wokwi:**
- **Blue button (GPIO 18)** — setpoint UP +1°C
- **Green button (GPIO 19)** — setpoint DOWN −1°C
- **Red button (GPIO 23)** — short click = toggle SIM/REAL mode | long click (hold >2 s) = start auto-tune

---

### Step 3 — Web Dashboard

```bash
cd smart-bottle-dashboard
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

You should see:
- The gauge updating live as the Wokwi simulation runs
- Temperature converging toward setpoint on the history chart
- PID output, Kp/Ki/Kd values, heater/cooler state all updating

To deploy publicly (no server needed — it's all static files):
```bash
# GitHub Pages: push smart-bottle-dashboard/ to a repo and enable Pages
```

---

### Step 4 — Trigger Auto-Tune (demo)

1. With Wokwi running, click and hold the **red OK button** for more than 2 seconds
2. OLED changes to "** AUTO-TUNING **" with a crossing counter (0/6 → 6/6)
3. Dashboard banner turns amber: "AUTO-TUNING IN PROGRESS"
4. After ~6 crossings (~2 minutes in simulation), banner turns green showing computed gains
5. Device resumes PID with the new Kp/Ki/Kd — you can see them update on the dashboard

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  ESP32 Firmware (main.cpp)                 │
│                                                            │
│  State machine:                                            │
│    NORMAL    → PID controller (Kp, Ki, Kd)                │
│    AUTO_TUNE → Relay experiment (Åström–Hägglund)         │
│                                                            │
│  Sip detector  ──► bottle/stats        (Firebase PUT)      │
│  Telemetry     ──► bottle/telemetry    (Firebase PUT)      │
│  Setpoint in   ◄── bottle/control/setpoint (Firebase GET)  │
│  PID params    ◄── bottle/control/pid  (Firebase GET)      │
└──────────────────────────┬─────────────────────────────────┘
                           │  Wi-Fi / HTTP REST
            ┌──────────────▼──────────────┐
            │  Firebase Realtime Database  │
            │  bottle/                     │
            │    telemetry/                │
            │    control/setpoint          │
            │    control/pid               │
            │    stats/                    │
            └──────────────┬──────────────┘
                           │  Firebase JS SDK (v8)
            ┌──────────────▼──────────────┐
            │  Web Dashboard (app.js)      │
            │    Gauge + history chart     │
            │    Remote setpoint control   │
            │    PID tuning sliders        │
            │    Auto-tune status banner   │
            │    Hydration / sip tracker   │
            │    Smart time scheduler      │
            └─────────────────────────────┘
```

---

## Firebase Data Model

```
bottle/
  telemetry/
    temperature    ← float   current temp (°C)
    setpoint       ← float   active setpoint on device
    heater         ← 0 | 1
    cooler         ← 0 | 1
    mode           ← "SIM" | "REAL"
    pidOutput      ← float   −100…+100  (signed: + = heating, − = cooling)
    Kp, Ki, Kd     ← float   active gains (syncs dashboard sliders)
    autoTuning     ← 0 | 1   1 while relay experiment is running
    sipDetected    ← 0 | 1   1 for one cycle when sip inferred
    ts             ← int     seconds since device boot

  control/
    setpoint       ← float   written by dashboard or buttons
    pid/
      Kp, Ki, Kd   ← float   written by dashboard; polled by device every 5 s

  stats/
    sipCountToday  ← int
    lastSipTemp    ← float
    lastSipUptimeS ← int     seconds since boot at last sip
    deviceUptimeS  ← int     current device uptime in seconds
```

---

## Repo Structure

```
iot-smart-water-bottle/
├── README.md
├── smart-water-bottle/              ← PlatformIO firmware project
│   ├── platformio.ini               ← board + all library dependencies
│   ├── diagram.json                 ← Wokwi circuit (ESP32+OLED+sensor+buttons)
│   ├── wokwi.toml                   ← Wokwi config
│   └── src/
│       └── main.cpp                 ← complete firmware
└── smart-bottle-dashboard/          ← static web app (no server needed)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

---

## Hardware Wiring (physical build only — not needed for Wokwi)

| Signal | ESP32 GPIO | Notes |
|---|---|---|
| SSD1306 SDA | 21 | I2C data |
| SSD1306 SCL | 22 | I2C clock |
| DS18B20 DQ | 4 | 4.7 kΩ pull-up to 3V3 |
| Button UP | 18 | INPUT_PULLUP → GND |
| Button DOWN | 19 | INPUT_PULLUP → GND |
| Button OK | 23 | INPUT_PULLUP → GND |
| Heater LED/MOSFET | 26 | via 220 Ω resistor |
| Cooler LED/MOSFET | 27 | via 220 Ω resistor |

All components already wired in `diagram.json` — zero changes needed for Wokwi simulation.

---

## Firmware Logic

```
Boot
 └─ Init WiFi · OLED · OneWire · timers
 └─ Read setpoint from Firebase (GET)
 └─ Read PID params from Firebase (GET)

Main loop (~800 ms)
 ├─ OK button
 │    short press (<500 ms) → toggle SIM / REAL mode
 │    long press  (>2000 ms) → start AUTO_TUNE
 │                            (or cancel if already tuning)
 ├─ UP / DOWN → setpoint ±1°C, push to Firebase
 ├─ Every 5 s → GET setpoint + PID params from Firebase
 ├─ Measure temperature
 │    SIM  → thermal model + ±0.3°C noise
 │    REAL → DS18B20; fallback to SIM if disconnected
 ├─ State machine
 │    NORMAL    → computePID() → drive HEATER_PIN / COOLER_PIN
 │    AUTO_TUNE → relay experiment
 │               → on 6th crossing: compute Kp/Ki/Kd (Ziegler–Nichols)
 │               → push to Firebase + resume NORMAL
 ├─ Sip detection → push bottle/stats if triggered
 ├─ Update OLED
 └─ PUT telemetry → bottle/telemetry
```

---

## Validation Targets

These are manual validation targets for the current prototype. The repository does not yet include a real automated unit-test suite for the firmware logic.

| ID | Test | Pass Condition |
|---|---|---|
| T1 | Telemetry | `bottle/telemetry` updates every ~1 s; all PUTs return HTTP 200 |
| T2 | Remote setpoint | Dashboard change reflected on OLED within 5 s |
| T3 | Local buttons | UP/DOWN updates OLED immediately and writes to Firebase |
| T4 | PID convergence | Temperature moves toward setpoint and remains controllable in simulation |
| T5 | Auto-tune trigger | Long OK press → OLED shows tuning screen, dashboard banner turns amber |
| T6 | Auto-tune completion | After 6 crossings, Kp/Ki/Kd update in firmware + Firebase + dashboard |
| T7 | Sip detection | Dashboard sipCount increments; session-local hourly chart updates while the page is open |
| T8 | Scheduler | Enabling schedule and waiting for a slot pushes correct setpoint |
| T9 | WiFi loss | All HTTP helpers return early — no crash, resumes on reconnect |
| T10 | Sensor fallback | DS18B20 disconnected in REAL mode → loop continues without NaN sensor values crashing control logic |

---

## Current Limitations

- The repository currently has build verification, but no implemented automated unit-test suite for firmware or dashboard logic.
- Full end-to-end verification still depends on running the ESP32 simulation or hardware against a live Firebase Realtime Database.
- The auto-tune routine is a practical relay-based approximation and should be presented as a demo-oriented tuning aid, not as a rigorously validated control-engineering implementation.
- In REAL mode, the current auto-tune path uses an internal fixed reference rather than the active runtime setpoint.
- The hydration dashboard's hourly sip chart is session-local in the browser and is not reconstructed from persisted per-hour Firebase history.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| PID over bang-bang | Bang-bang causes constant actuator cycling and oscillation. PID with deadband reaches setpoint smoothly. |
| Relay auto-tuning | Uses a relay-based retuning routine inspired by published control literature, without extra hardware. |
| Crossing-based relay criterion | A simple crossing-based relay is easier to observe and demonstrate than inflection-based logic in this simulation-oriented project. |
| First-order thermal lag in simulation | Without lag, the relay experiment produces unmeasurably small oscillations. Lag creates ~5.6 s response delay, enabling genuine limit cycles. Also more physically realistic. |
| Measurement noise in simulation | Zero-noise simulation produces Ku too large for the dashboard sliders. ±0.3 °C noise gives realistic amplitude → sensible Kp/Ki/Kd. |
| Sip detection from temperature | No extra BOM. Thermal drop signature is consistent and threshold-adjustable. |
| Derivative on error (not measurement) | Simpler to implement with the current controller state. This improves responsiveness to changing error, but setpoint steps can produce derivative kick. |
| Anti-windup clamp ±50 | Without it, large sustained errors saturate the integrator, causing significant overshoot when the error finally resolves. |
| Firebase HTTP REST (no SDK) | Keeps firmware footprint minimal. No `firebase-arduino` library. Plain `HTTPClient` PUT/GET is sufficient at this data rate. |
| Static web dashboard | No backend required. Free hosting via GitHub Pages. |

---

*Built with PlatformIO · Wokwi · Firebase Realtime Database · Chart.js · Vanilla HTML/CSS/JS*

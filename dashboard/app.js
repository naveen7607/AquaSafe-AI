/* ==========================================================================
   AquaSafe AI - Dashboard Application Core Logic
   ========================================================================== */

// --- Global App State ---
const state = {
    // Current sensor values
    telemetry: {
        pH: 7.20,
        tds: 245,
        temperature: 28.0,
        turbidity: 18,
        phWorking: true,
        tdsWorking: true,
        tempWorking: true,
        turbidityWorking: true,
        waterScore: 94,
        overallStatus: 0, // 0: Safe, 1: Warning, 2: Danger, 3: Error
        reason: "Water is Safe"
    },
    
    // System Thresholds (loaded from LocalStorage if exists, else defaults)
    thresholds: {
        phDangerLow: 5.5,
        phWarnLow: 6.5,
        phWarnHigh: 8.5,
        phDangerHigh: 9.0,
        tdsWarn: 300,
        tdsDanger: 600,
        tempWarn: 30.0,
        tempDanger: 40.0,
        turbWarn: 5,
        turbDanger: 15
    },

    alerts: [],
    lastStatus: 0,
    dbMode: "simulated", // "simulated" or "thingspeak"
    chart: null,
    tsChannelId: "3425398",
    tsReadKey: "",
    tsInterval: null,
    analyticsRange: "day"
};

// --- Tab Setup Mapping ---
const tabConfig = {
    live: { title: "Live Monitor", desc: "Real-time parameters, health metrics, and overall score." },
    analytics: { title: "Analytics & Trends", desc: "Historical database graphs and parameter variations." },
    alerts: { title: "Alert Logs", desc: "Chronological log of critical parameter deviations." },
    settings: { title: "System Thresholds", desc: "Configure alert levels and link live cloud databases." },
    simulator: { title: "ESP32 Simulator Panel", desc: "Control virtual hardware to dry-test your system." }
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    initTabs();
    initClock();
    initSimulator();
    initChart();
    
    // Setup Action Listeners
    document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
    document.getElementById("clear-alerts-btn").addEventListener("click", clearAlerts);
    
    // Bind connection change button to reopen modal
    document.getElementById("change-connection-btn").addEventListener("click", showStartupModal);

    // Setup Range Tabs Listeners in Analytics
    const rangeButtons = document.querySelectorAll(".analytics-controls .btn-tab");
    rangeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            rangeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const range = btn.getAttribute("data-range");
            state.analyticsRange = range;
            
            if (state.dbMode === "thingspeak") {
                loadThingSpeakHistory(range);
            } else {
                generateSimulatedHistory(range);
            }
        });
    });

    // Check if TS credentials exist in cookies. If they do, start live sync automatically.
    // Otherwise, block the screen and show startup modal.
    const savedDbMode = getCookie("db_mode");
    const hasChannel = getCookie("ts_channel_id");
    
    if (savedDbMode === "thingspeak" && hasChannel) {
        state.dbMode = "thingspeak";
        linkThingSpeakStartup();
    } else if (savedDbMode === "simulated") {
        state.dbMode = "simulated";
        const modal = document.getElementById("startup-modal");
        if (modal) modal.style.display = "none";
        
        updateStatusBadge("offline", "ESP32: Simulated");
        evaluateQuality();
        generateSimulatedHistory(state.analyticsRange || "day");
    } else if (hasChannel) {
        state.dbMode = "thingspeak";
        linkThingSpeakStartup();
    } else {
        showStartupModal();
    }

    // Modal Action Bindings
    document.getElementById("modal-connect-btn").addEventListener("click", handleModalConnect);
    document.getElementById("modal-sim-btn").addEventListener("click", handleModalSimulate);
});

// --- Tab Routing Logic ---
function initTabs() {
    const navItems = document.querySelectorAll(".nav-item");
    const contents = document.querySelectorAll(".tab-content");
    
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const tabId = item.getAttribute("data-tab");
            
            // Toggle active classes
            navItems.forEach(n => n.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            
            item.classList.add("active");
            document.getElementById(`tab-${tabId}`).classList.add("active");
            
            // Update Headers
            document.getElementById("current-tab-title").innerText = tabConfig[tabId].title;
            document.getElementById("current-tab-desc").innerText = tabConfig[tabId].desc;
            
            // Re-render chart if analytics is chosen
            if (tabId === "analytics" && state.chart) {
                setTimeout(() => state.chart.update(), 50);
            }
        });
    });
}

// --- Live Clock ---
function initClock() {
    const clockEl = document.getElementById("live-time");
    const updateTime = () => {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// --- Simulator Control Panels (Isolated from ThingSpeak) ---
function initSimulator() {
    const sensors = ["ph", "tds", "temp", "turb"];
    
    sensors.forEach(s => {
        const slider = document.getElementById(`sim-val-${s}`);
        const label = document.getElementById(`sim-lbl-${s}`);
        
        slider.addEventListener("input", (e) => {
            let val = parseFloat(e.target.value);
            if (s === "tds" || s === "turb") val = parseInt(val);
            label.innerText = val.toFixed(s === "ph" || s === "temp" ? 1 : 0);
            
            // Auto run simulation on slider input but do NOT update Live Monitor
            runSimulatorInstant(false);
        });
        
        // Also bind checkboxes to auto-run on status toggle (no Live Monitor update)
        const checkbox = document.getElementById(`sim-work-${s}`);
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                runSimulatorInstant(false);
            });
        }
    });

    const runBtn = document.getElementById("sim-run-btn");
    if (runBtn) {
        runBtn.addEventListener("click", () => {
            runSimulatorInstant(true);
            
            // Premium micro-animation visual feedback on button press
            const originalHTML = runBtn.innerHTML;
            runBtn.innerHTML = '<i class="fa-solid fa-check"></i> Simulation Sent!';
            runBtn.style.backgroundColor = "#10b981"; // change to emerald green
            runBtn.style.borderColor = "#10b981";
            setTimeout(() => {
                runBtn.innerHTML = originalHTML;
                runBtn.style.backgroundColor = "";
                runBtn.style.borderColor = "";
            }, 1500);
        });
    }
    
    // Load previously saved simulator settings and run immediately (initial load sync)
    loadSimulatorSettings();
}

function runSimulatorInstant(updateLive = true) {
    const pH = parseFloat(document.getElementById("sim-val-ph").value);
    const tds = parseInt(document.getElementById("sim-val-tds").value);
    const temperature = parseFloat(document.getElementById("sim-val-temp").value);
    const turbidity = parseInt(document.getElementById("sim-val-turb").value);
    
    const phWorking = document.getElementById("sim-work-ph").checked;
    const tdsWorking = document.getElementById("sim-work-tds").checked;
    const tempWorking = document.getElementById("sim-work-temp").checked;
    const turbidityWorking = document.getElementById("sim-work-turb").checked;
    
    // Save current simulator inputs in LocalStorage immediately
    const simSettings = {
        ph: pH,
        tds: tds,
        temp: temperature,
        turb: turbidity,
        phWorking: phWorking,
        tdsWorking: tdsWorking,
        tempWorking: tempWorking,
        turbWorking: turbidityWorking
    };
    try {
        localStorage.setItem("aquasafe_sim_settings", JSON.stringify(simSettings));
    } catch (e) {
        console.error("Failed to save simulator settings", e);
    }

    // Sync telemetry to global state if running in simulated mode AND updateLive is enabled
    if (state.dbMode === "simulated" && updateLive === true) {
        state.telemetry.pH = pH;
        state.telemetry.tds = tds;
        state.telemetry.temperature = temperature;
        state.telemetry.turbidity = turbidity;
        state.telemetry.phWorking = phWorking;
        state.telemetry.tdsWorking = tdsWorking;
        state.telemetry.tempWorking = tempWorking;
        state.telemetry.turbidityWorking = turbidityWorking;
        
        // Re-evaluate quality scores and status on the main dashboard gauges & cards
        evaluateQuality();
    }
    
    // Calculate quality score and status locally for simulation result card
    const simResult = calculateScoreAndStatusLocal(
        pH, tds, temperature, turbidity,
        phWorking, tdsWorking, tempWorking, turbidityWorking
    );
    
    // Update the simulation result box on the right sidebar of the simulator tab
    updateSimResultBox(simResult);
    
    // Update Beakers Visual Simulation
    updateBeakersVisual(pH, tds, temperature, turbidity, phWorking, tdsWorking, tempWorking, turbidityWorking);
}

function getPHColor(ph) {
    let hue = 0;
    if (ph <= 7) {
        hue = (ph / 7) * 170;
    } else {
        hue = 170 + ((ph - 7) / 7) * (280 - 170);
    }
    return `hsla(${hue}, 75%, 45%, 0.45)`;
}

function updateBeakersVisual(pH, tds, temp, turb, phWorking, tdsWorking, tempWorking, turbWorking) {
    // 1. pH Beaker
    const waterPH = document.getElementById("water-ph");
    if (waterPH) {
        if (!phWorking) {
            waterPH.style.backgroundColor = "rgba(100, 100, 100, 0.2)";
        } else {
            waterPH.style.backgroundColor = getPHColor(pH);
        }
    }
    
    // 2. TDS Beaker
    const particlesTDS = document.getElementById("particles-tds");
    if (particlesTDS) {
        // Cache check: only regenerate if TDS value or health has changed
        if (particlesTDS.dataset.value !== tds.toString() || particlesTDS.dataset.working !== tdsWorking.toString()) {
            particlesTDS.dataset.value = tds;
            particlesTDS.dataset.working = tdsWorking;
            particlesTDS.innerHTML = "";
            
            if (tdsWorking && tds > 10) {
                const count = Math.min(50, Math.floor(tds / 15));
                for (let i = 0; i < count; i++) {
                    const p = document.createElement("div");
                    p.className = "tds-particle";
                    p.style.left = `${Math.random() * 90}%`;
                    p.style.top = `${Math.random() * 80 + 10}%`;
                    p.style.setProperty("--tx", `${(Math.random() - 0.5) * 16}px`);
                    p.style.setProperty("--ty", `${(Math.random() - 0.5) * 16}px`);
                    p.style.animationDelay = `${Math.random() * 3}s`;
                    particlesTDS.appendChild(p);
                }
            }
        }
    }
    const waterTDS = document.getElementById("water-tds");
    if (waterTDS) {
        waterTDS.style.backgroundColor = tdsWorking ? "rgba(59, 130, 246, 0.45)" : "rgba(100, 100, 100, 0.2)";
    }
    
    // 3. Temp Beaker
    const vaporsTemp = document.getElementById("vapors-temp");
    if (vaporsTemp) {
        // Cache check: only regenerate if Temp value or health has changed
        if (vaporsTemp.dataset.value !== temp.toString() || vaporsTemp.dataset.working !== tempWorking.toString()) {
            vaporsTemp.dataset.value = temp;
            vaporsTemp.dataset.working = tempWorking;
            vaporsTemp.innerHTML = "";
            
            if (tempWorking && temp > 30) {
                const count = Math.min(20, Math.floor((temp - 30) * 0.6));
                for (let i = 0; i < count; i++) {
                    const v = document.createElement("div");
                    v.className = "vapor";
                    v.style.left = `${Math.random() * 40 + 30}px`;
                    v.style.setProperty("--vx", `${(Math.random() - 0.5) * 15}px`);
                    v.style.animationDelay = `${Math.random() * 1.8}s`;
                    v.style.animationDuration = `${1.2 + Math.random() * 0.8}s`;
                    vaporsTemp.appendChild(v);
                }
            }
        }
    }
    const waterTemp = document.getElementById("water-temp");
    if (waterTemp) {
        if (!tempWorking) {
            waterTemp.style.backgroundColor = "rgba(100, 100, 100, 0.2)";
        } else {
            const ratio = Math.min(1.0, Math.max(0.0, (temp - 20) / 40));
            const r = Math.round(59 + (230 - 59) * ratio);
            const g = Math.round(130 + (80 - 130) * ratio);
            const b = Math.round(246 + (80 - 246) * ratio);
            waterTemp.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.45)`;
        }
    }
    
    // 4. Turbidity Beaker
    const waterTurb = document.getElementById("water-turb");
    if (waterTurb) {
        if (!turbWorking) {
            waterTurb.style.backgroundColor = "rgba(100, 100, 100, 0.2)";
            waterTurb.style.filter = "none";
        } else {
            const ratio = turb / 100;
            const r = Math.round(59 + (125 - 59) * ratio);
            const g = Math.round(130 + (95 - 130) * ratio);
            const b = Math.round(246 + (75 - 246) * ratio);
            const a = 0.45 + 0.35 * ratio;
            waterTurb.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
            waterTurb.style.filter = `blur(${ratio * 6}px)`;
        }
    }
}

function updateSimResultBox(simResult) {
    const box = document.getElementById("sim-result-box");
    const statusEl = document.getElementById("sim-res-status");
    const scoreEl = document.getElementById("sim-res-score");
    const reasonEl = document.getElementById("sim-res-reason");
    
    box.style.display = "block";
    scoreEl.innerText = `Score: ${simResult.waterScore}/100`;
    reasonEl.innerText = `Reason: ${simResult.reason}`;
    
    statusEl.className = "status-tag"; // Reset
    if (simResult.overallStatus === 0) {
        statusEl.innerText = "SAFE";
        statusEl.classList.add("tag-safe");
    } else if (simResult.overallStatus === 1) {
        statusEl.innerText = "WARNING";
        statusEl.classList.add("tag-warning");
    } else if (simResult.overallStatus === 2) {
        statusEl.innerText = "DANGER";
        statusEl.classList.add("tag-danger");
    } else {
        statusEl.innerText = "FAULT";
        statusEl.classList.add("tag-danger");
    }
}

function loadSimulatorSettings() {
    try {
        const stored = localStorage.getItem("aquasafe_sim_settings");
        if (stored) {
            const settings = JSON.parse(stored);
            
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el && val !== undefined) el.value = val;
            };
            
            // Handle lowercase / camelCase fallbacks for slider settings
            const getVal = (key1, key2) => settings[key1] !== undefined ? settings[key1] : settings[key2];
            
            setVal("sim-val-ph", getVal("ph", "pH"));
            setVal("sim-val-tds", getVal("tds", "TDS"));
            setVal("sim-val-temp", getVal("temp", "temperature"));
            setVal("sim-val-turb", getVal("turb", "turbidity"));
            
            const setChk = (id, checked) => {
                const el = document.getElementById(id);
                if (el && checked !== undefined) el.checked = checked;
            };
            
            setChk("sim-work-ph", getVal("phWorking", "phworking"));
            setChk("sim-work-tds", getVal("tdsWorking", "tdsworking"));
            setChk("sim-work-temp", getVal("tempWorking", "tempworking"));
            setChk("sim-work-turb", getVal("turbWorking", "turbworking"));
            
            // Sync slider label texts
            const phVal = getVal("ph", "pH");
            const tdsVal = getVal("tds", "TDS");
            const tempVal = getVal("temp", "temperature");
            const turbVal = getVal("turb", "turbidity");
            
            if (phVal !== undefined) document.getElementById("sim-lbl-ph").innerText = parseFloat(phVal).toFixed(1);
            if (tdsVal !== undefined) document.getElementById("sim-lbl-tds").innerText = tdsVal;
            if (tempVal !== undefined) document.getElementById("sim-lbl-temp").innerText = parseFloat(tempVal).toFixed(1);
            if (turbVal !== undefined) document.getElementById("sim-lbl-turb").innerText = turbVal;
        }
    } catch (e) {
        console.error("Failed to load simulator settings", e);
    }
    
    // Initial evaluation once on load
    runSimulatorInstant();
}

// --- Water Quality Evaluation Engine (Matches firmware logic) ---
function evaluateQuality() {
    if (state.dbMode !== "simulated") return; // Let Cloud sync handle evaluation/display
    
    const t = state.telemetry;
    const c = state.thresholds;
    
    // Evaluate Parameter Statuses and individual scores
    let phStatus = 0; // 0: Safe, 1: Warn, 2: Danger
    let phScore = 100;
    let phReason = "";
    
    if (!t.phWorking) {
        phStatus = 3; // Error
        phScore = 0;
    } else {
        if (t.pH >= c.phWarnLow && t.pH <= c.phWarnHigh) {
            phScore = 100;
        } else if (t.pH >= c.phDangerLow && t.pH < c.phWarnLow) {
            phStatus = 1;
            phReason = "Low pH (Acidic)";
            phScore = mapFloat(t.pH, c.phDangerLow, c.phWarnLow, 50, 100);
        } else if (t.pH > c.phWarnHigh && t.pH <= c.phDangerHigh) {
            phStatus = 1;
            phReason = "High pH (Alkaline)";
            phScore = mapFloat(t.pH, c.phWarnHigh, c.phDangerHigh, 100, 50);
        } else if (t.pH < c.phDangerLow) {
            phStatus = 2;
            phReason = "Critical Acidic pH!";
            phScore = mapFloat(t.pH, 0, c.phDangerLow, 0, 50);
        } else {
            phStatus = 2;
            phReason = "Critical Alkaline pH!";
            phScore = mapFloat(t.pH, c.phDangerHigh, 14, 50, 0);
        }
    }
    
    let tdsStatus = 0;
    let tdsScore = 100;
    let tdsReason = "";
    
    if (!t.tdsWorking) {
        tdsStatus = 3;
        tdsScore = 0;
    } else {
        if (t.tds <= c.tdsWarn) {
            tdsScore = 100;
        } else if (t.tds > c.tdsWarn && t.tds <= c.tdsDanger) {
            tdsStatus = 1;
            tdsReason = "High TDS (Mineralized)";
            tdsScore = mapFloat(t.tds, c.tdsWarn, c.tdsDanger, 100, 50);
        } else {
            tdsStatus = 2;
            tdsReason = "Critical High TDS!";
            tdsScore = Math.max(0, mapFloat(t.tds, c.tdsDanger, 1000, 50, 0));
        }
    }
    
    let tempStatus = 0;
    let tempScore = 100;
    let tempReason = "";
    
    if (!t.tempWorking) {
        tempStatus = 3;
        tempScore = 0;
    } else {
        if (t.temperature <= c.tempWarn) {
            tempScore = 100;
        } else if (t.temperature > c.tempWarn && t.temperature <= c.tempDanger) {
            tempStatus = 1;
            tempReason = "Warm Temperature";
            tempScore = mapFloat(t.temperature, c.tempWarn, c.tempDanger, 100, 50);
        } else {
            tempStatus = 2;
            tempReason = "Critical High Temperature!";
            tempScore = Math.max(0, mapFloat(t.temperature, c.tempDanger, 60, 50, 0));
        }
    }
    
    let turbStatus = 0;
    let turbScore = 100;
    let turbReason = "";
    
    if (!t.turbidityWorking) {
        turbStatus = 3;
        turbScore = 0;
    } else {
        if (t.turbidity <= c.turbWarn) {
            turbScore = 100;
        } else if (t.turbidity > c.turbWarn && t.turbidity <= c.turbDanger) {
            turbStatus = 1;
            turbReason = "Cloudy/Turbid Water";
            turbScore = mapFloat(t.turbidity, c.turbWarn, c.turbDanger, 100, 50);
        } else {
            turbStatus = 2;
            turbReason = "Critical Turbidity!";
            turbScore = Math.max(0, mapFloat(t.turbidity, c.turbDanger, 100, 50, 0));
        }
    }
    
    // Overall Water Score Calculation
    let activeSensors = 0;
    let totalScore = 0;
    
    if (t.phWorking) { totalScore += phScore; activeSensors++; }
    if (t.tdsWorking) { totalScore += tdsScore; activeSensors++; }
    if (t.tempWorking) { totalScore += tempScore; activeSensors++; }
    if (t.turbidityWorking) { totalScore += turbScore; activeSensors++; }
    
    if (!t.phWorking || !t.tdsWorking || !t.tempWorking || !t.turbidityWorking) {
        t.waterScore = 0;
    } else {
        t.waterScore = activeSensors > 0 ? Math.round(totalScore / activeSensors) : 0;
    }
    
    // Overall Status logic (Hierarchy: Error > Danger > Warning > Safe)
    if (!t.phWorking || !t.tdsWorking || !t.tempWorking || !t.turbidityWorking) {
        t.overallStatus = 3; // Error
        let errs = [];
        if (!t.phWorking) errs.push("pH");
        if (!t.tdsWorking) errs.push("TDS");
        if (!t.tempWorking) errs.push("Temp");
        if (!t.turbidityWorking) errs.push("Turb");
        t.reason = "Sensor Failure: " + errs.join(", ");
    } else if (phStatus === 2 || tdsStatus === 2 || tempStatus === 2 || turbStatus === 2) {
        t.overallStatus = 2; // Danger
        t.reason = phReason || tdsReason || turbReason || tempReason;
    } else if (phStatus === 1 || tdsStatus === 1 || tempStatus === 1 || turbStatus === 1) {
        t.overallStatus = 1; // Warning
        t.reason = phReason || tdsReason || turbReason || tempReason;
    } else {
        t.overallStatus = 0; // Safe
        t.reason = "Water quality is within optimal guidelines.";
    }
    
    updateUI(phStatus, tdsStatus, tempStatus, turbStatus);
    checkAndLogAlerts();
}

// --- UI Sync Updates ---
function updateUI(phStatus, tdsStatus, tempStatus, turbStatus) {
    const t = state.telemetry;
    
    // 1. Text readings updates
    document.getElementById("val-ph").innerText = t.phWorking ? t.pH.toFixed(2) : "NW";
    document.getElementById("val-tds").innerText = t.tdsWorking ? t.tds : "NW";
    document.getElementById("val-temp").innerText = t.tempWorking ? t.temperature.toFixed(1) : "NW";
    document.getElementById("val-turb").innerText = t.turbidityWorking ? t.turbidity : "NW";
    
    // 2. Status Tags Updates
    updateCardStatus("ph", phStatus, t.phWorking);
    updateCardStatus("tds", tdsStatus, t.tdsWorking);
    updateCardStatus("temp", tempStatus, t.tempWorking);
    updateCardStatus("turb", turbStatus, t.turbidityWorking);
    
    // 3. Score Gauge Ring and Number
    document.getElementById("score-number").innerText = t.waterScore;
    const circle = document.getElementById("score-ring");
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (t.waterScore / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Change score ring color based on status
    if (t.overallStatus === 0) circle.setAttribute("stroke", "var(--color-safe)");
    else if (t.overallStatus === 1) circle.setAttribute("stroke", "var(--color-warning)");
    else if (t.overallStatus === 2) circle.setAttribute("stroke", "var(--color-danger)");
    else circle.setAttribute("stroke", "var(--color-error)");
    
    // 4. Progress bar indicators
    // pH level is bidirectional (optimal is in the middle)
    const phBar = document.getElementById("bar-ph");
    if (t.phWorking) {
        phBar.style.display = "block";
        phBar.style.left = `${(t.pH / 14) * 100}%`;
    } else {
        phBar.style.display = "none";
    }
    
    // TDS, Temp, Turbidity are fills
    document.getElementById("bar-tds").style.width = t.tdsWorking ? `${Math.min(100, (t.tds / 1000) * 100)}%` : "0%";
    document.getElementById("bar-temp").style.width = t.tempWorking ? `${Math.min(100, (t.temperature / 60) * 100)}%` : "0%";
    document.getElementById("bar-turb").style.width = t.turbidityWorking ? `${t.turbidity}%` : "0%";
    
    // Colors of progress indicators
    updateProgressFillColor("bar-ph", phStatus, true);
    updateProgressFillColor("bar-tds", tdsStatus);
    updateProgressFillColor("bar-temp", tempStatus);
    updateProgressFillColor("bar-turb", turbStatus);
    
    // 5. Main overall status banner card
    const banner = document.getElementById("overall-status-card");
    const title = document.getElementById("overall-status-value");
    const desc = document.getElementById("overall-status-reason");
    const icon = document.getElementById("overall-status-icon");
    
    banner.className = "status-card"; // Reset
    icon.className = "status-icon fa-solid";
    
    if (t.overallStatus === 0) {
        banner.classList.add("status-safe");
        title.innerText = "SAFE";
        desc.innerText = t.reason;
        icon.classList.add("fa-circle-check");
    } else if (t.overallStatus === 1) {
        banner.classList.add("status-warning");
        title.innerText = "WARNING";
        desc.innerText = t.reason;
        icon.classList.add("fa-triangle-exclamation");
    } else if (t.overallStatus === 2) {
        banner.classList.add("status-danger");
        title.innerText = "DANGER";
        desc.innerText = t.reason;
        icon.classList.add("fa-radiation");
    } else {
        banner.classList.add("status-error");
        title.innerText = "SENSOR FAULT";
        desc.innerText = t.reason;
        icon.classList.add("fa-triangle-exclamation");
    }
}

function updateCardStatus(prefix, status, isWorking) {
    const card = document.getElementById(`card-${prefix}`);
    const tag = document.getElementById(`${prefix}-status`);
    
    card.style.borderColor = "var(--border-color)"; // Reset
    tag.className = "status-tag"; // Reset
    
    if (!isWorking) {
        tag.innerText = "Fault";
        tag.classList.add("tag-error");
        card.style.borderColor = "rgba(168, 85, 247, 0.2)";
    } else if (status === 0) {
        tag.innerText = "Safe";
        tag.classList.add("tag-safe");
    } else if (status === 1) {
        tag.innerText = "Warning";
        tag.classList.add("tag-warning");
        card.style.borderColor = "rgba(245, 158, 11, 0.2)";
    } else {
        tag.innerText = "Danger";
        tag.classList.add("tag-danger");
        card.style.borderColor = "rgba(239, 68, 68, 0.2)";
    }
}

function updateProgressFillColor(id, status, isIndicatorDot = false) {
    const el = document.getElementById(id);
    let color = "var(--color-safe)";
    if (status === 1) color = "var(--color-warning)";
    else if (status === 2) color = "var(--color-danger)";
    else if (status === 3) color = "var(--color-error)";
    
    if (isIndicatorDot) {
        el.style.backgroundColor = color;
        el.style.boxShadow = `0 0 6px ${color}`;
    } else {
        el.style.backgroundColor = color;
    }
}

// --- Alert Logging ---
function checkAndLogAlerts(forceLog = false) {
    const t = state.telemetry;
    
    // Check if status changed from previous reading, OR if forced (on new ThingSpeak entry)
    if (t.overallStatus !== state.lastStatus || forceLog) {
        if (t.overallStatus !== 0) {
            const timestamp = new Date().toLocaleTimeString();
            const isDuplicate = state.alerts.length > 0 && 
                                state.alerts[0].message.includes(t.reason) && 
                                state.alerts[0].timestamp === timestamp;
                                
            if (!isDuplicate) {
                const prefix = state.dbMode === "thingspeak" ? "[ThingSpeak] " : (state.dbMode === "firebase" ? "[Firebase] " : "[Sim] ");
                // Log new alert
                const alert = {
                    id: Date.now(),
                    severity: t.overallStatus === 1 ? "warning" : (t.overallStatus === 2 ? "danger" : "error"),
                    message: prefix + t.reason,
                    values: `pH:${t.phWorking ? t.pH.toFixed(1) : "NW"} | TDS:${t.tdsWorking ? t.tds : "NW"} | Temp:${t.tempWorking ? t.temperature.toFixed(0) + "°C" : "NW"} | Trb:${t.turbidityWorking ? t.turbidity + "%" : "NW"}`,
                    timestamp: timestamp
                };
                
                state.alerts.unshift(alert); // Add to beginning of array
                updateAlertsUI();
                
                // Push dynamic alert in logs and notify sidebar badge
                const badge = document.getElementById("alert-count");
                badge.innerText = state.alerts.length;
                badge.style.display = "inline-block";
            }
        }
        state.lastStatus = t.overallStatus;
    }
}

function updateAlertsUI() {
    const tbody = document.getElementById("alerts-tbody");
    tbody.innerHTML = "";
    
    if (state.alerts.length === 0) {
        tbody.innerHTML = `<tr id="no-alerts-row"><td colspan="4" class="no-data">No alerts logged. System is operating safely.</td></tr>`;
        return;
    }
    
    state.alerts.forEach(a => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="severity-pill ${a.severity}">${a.severity}</span></td>
            <td>${a.message}</td>
            <td><code>${a.values}</code></td>
            <td>${a.timestamp}</td>
        `;
        tbody.appendChild(tr);
    });
}

function clearAlerts() {
    state.alerts = [];
    updateAlertsUI();
    const badge = document.getElementById("alert-count");
    badge.innerText = "0";
    badge.style.display = "none";
}

// --- Local Settings Form Operations ---
function saveSettings() {
    const getVal = (id) => parseFloat(document.getElementById(id).value);
    
    state.thresholds.phDangerLow = getVal("cfg-ph-danger-low");
    state.thresholds.phWarnLow = getVal("cfg-ph-warn-low");
    state.thresholds.phWarnHigh = getVal("cfg-ph-warn-high");
    state.thresholds.phDangerHigh = getVal("cfg-ph-danger-high");
    
    state.thresholds.tdsWarn = getVal("cfg-tds-warn");
    state.thresholds.tdsDanger = getVal("cfg-tds-danger");
    
    state.thresholds.tempWarn = getVal("cfg-temp-warn");
    state.thresholds.tempDanger = getVal("cfg-temp-danger");
    
    state.thresholds.turbWarn = getVal("cfg-turb-warn");
    state.thresholds.turbDanger = getVal("cfg-turb-danger");
    
    // Save to LocalStorage
    localStorage.setItem("aquasafe_thresholds", JSON.stringify(state.thresholds));
    
    alert("Water quality thresholds updated successfully!");
    
    // If in ThingSpeak mode, re-fetch and recalculate everything immediately. Otherwise, run evaluateQuality()
    if (state.dbMode === "thingspeak") {
        syncThingSpeak();
        loadThingSpeakHistory();
    } else {
        evaluateQuality();
    }
}

function loadSettings() {
    const stored = localStorage.getItem("aquasafe_thresholds");
    if (stored) {
        try {
            state.thresholds = JSON.parse(stored);
            
            // Populate inputs
            const setVal = (id, val) => document.getElementById(id).value = val;
            const t = state.thresholds;
            
            setVal("cfg-ph-danger-low", t.phDangerLow);
            setVal("cfg-ph-warn-low", t.phWarnLow);
            setVal("cfg-ph-warn-high", t.phWarnHigh);
            setVal("cfg-ph-danger-high", t.phDangerHigh);
            setVal("cfg-tds-warn", t.tdsWarn);
            setVal("cfg-tds-danger", t.tdsDanger);
            setVal("cfg-temp-warn", t.tempWarn);
            setVal("cfg-temp-danger", t.tempDanger);
            setVal("cfg-turb-warn", t.turbWarn);
            setVal("cfg-turb-danger", t.turbDanger);
        } catch (e) {
            console.error("Error loading thresholds", e);
        }
    }
    
    // Load ThingSpeak credentials from COOKIES with 3-month expiry
    const savedChannelId = getCookie("ts_channel_id");
    const savedReadKey = getCookie("ts_read_key");
    const savedDbMode = getCookie("db_mode");
    
    if (savedChannelId) {
        state.tsChannelId = savedChannelId;
    }
    if (savedReadKey) {
        state.tsReadKey = savedReadKey;
    }
    if (savedDbMode) {
        state.dbMode = savedDbMode;
    }
}

// --- Historical Chart Configuration (Chart.js) ---
function createSingleChart(canvasId, label, dataColor) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: dataColor,
                backgroundColor: 'rgba(255, 255, 255, 0.01)',
                borderWidth: 2,
                pointRadius: 1.5,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.02)' },
                    ticks: { 
                        color: '#64748b', 
                        font: { family: 'Outfit', size: 9 },
                        maxTicksLimit: 12,
                        maxRotation: 0,
                        autoSkip: true
                    }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.02)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 10 } }
                }
            }
        }
    });
}

// --- Generate Simulated History based on Range (day/week/month) ---
function generateSimulatedHistory(range = "day") {
    if (!state.chart || !state.chart.ph) return;
    
    let labels = [];
    let numPoints = 12;
    
    if (range === "day") {
        labels = ["02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"];
        numPoints = 12;
    } else if (range === "week") {
        labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        numPoints = 7;
    } else if (range === "month") {
        labels = ["2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28", "30"];
        numPoints = 15;
    }
    
    const phData = [];
    const tdsData = [];
    const tempData = [];
    const turbData = [];
    const scoreData = [];
    const statusData = [];
    
    for (let i = 0; i < numPoints; i++) {
        // Generate realistic mock points for simulation charts
        const pH = 7.0 + Math.sin(i * 0.5) * 0.3 + (Math.random() * 0.05);
        const tds = Math.round(230 + Math.cos(i * 0.4) * 25 + (Math.random() * 8));
        const temp = 27.0 + Math.sin(i * 0.3) * 1.5 + (Math.random() * 0.3);
        const turb = Math.round(7 + Math.cos(i * 0.5) * 3 + (Math.random() * 1.5));
        
        const evalResult = calculateScoreAndStatusLocal(pH, tds, temp, turb, true, true, true, true);
        
        phData.push(pH);
        tdsData.push(tds);
        tempData.push(temp);
        turbData.push(turb);
        scoreData.push(evalResult.waterScore);
        statusData.push(evalResult.overallStatus);
    }
    
    const populateChartData = (chartObj, chartLabels, chartVals) => {
        if (chartObj) {
            chartObj.data.labels = chartLabels;
            chartObj.data.datasets[0].data = chartVals;
            chartObj.update();
        }
    };
    
    populateChartData(state.chart.ph, labels, phData);
    populateChartData(state.chart.tds, labels, tdsData);
    populateChartData(state.chart.temp, labels, tempData);
    populateChartData(state.chart.turb, labels, turbData);
    populateChartData(state.chart.score, labels, scoreData);
    populateChartData(state.chart.status, labels, statusData);
}

function initChart() {
    state.chart = {
        ph: createSingleChart('chart-ph', 'pH Level', '#10b981'),
        tds: createSingleChart('chart-tds', 'TDS (ppm)', '#f59e0b'),
        temp: createSingleChart('chart-temp', 'Temp (°C)', '#ef4444'),
        turb: createSingleChart('chart-turb', 'Turbidity (%)', '#3b82f6'),
        score: createSingleChart('chart-score', 'Water Score', '#ffffff'),
        status: createSingleChart('chart-status', 'Safety Status', '#a855f7')
    };
}

function pushDataToCharts(timeStr, pH, tds, temp, turb, score, status) {
    if (!state.chart || !state.chart.ph) return;
    
    const updateDataset = (chartObj, val) => {
        chartObj.data.labels.shift();
        chartObj.data.labels.push(timeStr);
        chartObj.data.datasets[0].data.shift();
        chartObj.data.datasets[0].data.push(val);
        chartObj.update();
    };
    
    updateDataset(state.chart.ph, pH);
    updateDataset(state.chart.tds, tds);
    updateDataset(state.chart.temp, temp);
    updateDataset(state.chart.turb, turb);
    updateDataset(state.chart.score, score);
    updateDataset(state.chart.status, status);
}

// --- Status Badge Helper ---
function updateStatusBadge(theme, text) {
    const el = document.getElementById("device-status");
    const label = document.getElementById("status-text");
    if (el && label) {
        el.className = "device-status " + theme;
        label.innerText = text;
    }
}

function updateSimulatorControlsFromState() {
    const t = state.telemetry;
    
    const setSimVal = (name, val) => {
        const slider = document.getElementById(`sim-val-${name}`);
        if (slider) {
            slider.value = val;
            document.getElementById(`sim-lbl-${name}`).innerText = val.toFixed(name === "ph" || name === "temp" ? 1 : 0);
        }
    };
    
    setSimVal("ph", t.pH);
    setSimVal("tds", t.tds);
    setSimVal("temp", t.temperature);
    setSimVal("turb", t.turbidity);
    
    const wPH = document.getElementById("sim-work-ph");
    const wTDS = document.getElementById("sim-work-tds");
    const wTEMP = document.getElementById("sim-work-temp");
    const wTURB = document.getElementById("sim-work-turb");
    
    if (wPH) wPH.checked = t.phWorking;
    if (wTDS) wTDS.checked = t.tdsWorking;
    if (wTEMP) wTEMP.checked = t.tempWorking;
    if (wTURB) wTURB.checked = t.turbidityWorking;
}

// --- Recalculate Water Score and Safety Status Locally ---
function calculateScoreAndStatusLocal(pH, tds, temp, turb, phWorking, tdsWorking, tempWorking, turbWorking) {
    const c = state.thresholds;
    
    if (!phWorking || !tdsWorking || !tempWorking || !turbWorking) {
        let errs = [];
        if (!phWorking) errs.push("pH");
        if (!tdsWorking) errs.push("TDS");
        if (!tempWorking) errs.push("Temp");
        if (!turbWorking) errs.push("Turb");
        return {
            overallStatus: 3, // FAULT
            waterScore: 0,
            reason: "Sensor Failure: " + errs.join(", ")
        };
    }
    
    const phStatus = (pH >= c.phWarnLow && pH <= c.phWarnHigh) ? 0 : ((pH < c.phDangerLow || pH > c.phDangerHigh) ? 2 : 1);
    const tdsStatus = (tds <= c.tdsWarn) ? 0 : (tds > c.tdsDanger ? 2 : 1);
    const tempStatus = (temp <= c.tempWarn) ? 0 : (temp > c.tempDanger ? 2 : 1);
    const turbStatus = (turb <= c.turbWarn) ? 0 : (turb > c.turbDanger ? 2 : 1);
    
    let warnings = [];
    if (phStatus !== 0) warnings.push(pH < c.phWarnLow ? "Low pH" : "High pH");
    if (tdsStatus !== 0) warnings.push("High TDS");
    if (tempStatus !== 0) warnings.push("High Temp");
    if (turbStatus !== 0) warnings.push("High Turb");
    
    let overallStatus = 0;
    if (phStatus === 2 || tdsStatus === 2 || tempStatus === 2 || turbStatus === 2) {
        overallStatus = 2; // Danger
    } else if (phStatus === 1 || tdsStatus === 1 || tempStatus === 1 || turbStatus === 1) {
        overallStatus = 1; // Warning
    }
    
    let reason = "Water quality is within optimal guidelines.";
    if (warnings.length > 0) {
        reason = warnings.join(" & ");
    }
    
    // Calculate water quality score (starts at 100, deduct for deviations)
    let score = 100;
    if (phStatus === 1) score -= 15;
    else if (phStatus === 2) score -= 30;
    
    if (tdsStatus === 1) score -= 15;
    else if (tdsStatus === 2) score -= 30;
    
    if (tempStatus === 1) score -= 10;
    else if (tempStatus === 2) score -= 20;
    
    if (turbStatus === 1) score -= 15;
    else if (turbStatus === 2) score -= 30;
    
    score = Math.max(0, Math.min(100, score));
    
    return {
        overallStatus: overallStatus,
        waterScore: score,
        reason: reason
    };
}

// --- Sync latest feeds from ThingSpeak ---
async function syncThingSpeak() {
    const channelId = state.tsChannelId || "3425398";
    const readKey = state.tsReadKey ? state.tsReadKey.trim() : "";
    
    let url = `https://api.thingspeak.com/channels/${channelId}/feeds/last.json`;
    if (readKey) {
        url += `?api_key=${readKey}`;
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        
        if (data && data.entry_id) {
            state.dbMode = "thingspeak";
            updateStatusBadge("online", "ThingSpeak: Connected");
            
            // Check if this is a new entry ID to log alerts
            const isNewEntry = (state.lastEntryId !== undefined && state.lastEntryId !== data.entry_id);
            state.lastEntryId = data.entry_id;
            
            // Safe parser utility to prevent fallbacks on '0' values
            const parseVal = (val, def) => {
                if (val === null || val === undefined || val === "") return def;
                const parsed = parseFloat(val);
                return isNaN(parsed) ? def : parsed;
            };
            
            // Extract raw telemetry fields safely
            const pH = parseVal(data.field1, 7.0);
            const tds = Math.round(parseVal(data.field2, 0));
            const temperature = parseVal(data.field3, 25.0);
            const turbidity = Math.round(parseVal(data.field4, 0));
            
            // Health flags bitmask from field7
            const healthBitmask = parseInt(data.field7) || 15;
            const phWorking = (healthBitmask & 1) !== 0;
            const tdsWorking = (healthBitmask & 2) !== 0;
            const tempWorking = (healthBitmask & 4) !== 0;
            const turbidityWorking = (healthBitmask & 8) !== 0;
            
            // Re-calculate water score and safety status locally using website thresholds!
            const evalResult = calculateScoreAndStatusLocal(pH, tds, temperature, turbidity, phWorking, tdsWorking, tempWorking, turbidityWorking);
            
            state.telemetry.pH = pH;
            state.telemetry.tds = tds;
            state.telemetry.temperature = temperature;
            state.telemetry.turbidity = turbidity;
            state.telemetry.phWorking = phWorking;
            state.telemetry.tdsWorking = tdsWorking;
            state.telemetry.tempWorking = tempWorking;
            state.telemetry.turbidityWorking = turbidityWorking;
            
            state.telemetry.waterScore = evalResult.waterScore;
            state.telemetry.overallStatus = evalResult.overallStatus;
            state.telemetry.reason = evalResult.reason;
            
            // Telemetry updated from feeds
            
            // Update gauges & cards
            const t = state.telemetry;
            const c = state.thresholds;
            const phStatus = !t.phWorking ? 3 : ((t.pH >= c.phWarnLow && t.pH <= c.phWarnHigh) ? 0 : ((t.pH < c.phDangerLow || t.pH > c.phDangerHigh) ? 2 : 1));
            const tdsStatus = !t.tdsWorking ? 3 : (t.tds <= c.tdsWarn ? 0 : (t.tds > c.tdsDanger ? 2 : 1));
            const tempStatus = !t.tempWorking ? 3 : (t.temperature <= c.tempWarn ? 0 : (t.temperature > c.tempDanger ? 2 : 1));
            const turbStatus = !t.turbidityWorking ? 3 : (t.turbidity <= c.turbWarn ? 0 : (t.turbidity > c.turbDanger ? 2 : 1));
            
            updateUI(phStatus, tdsStatus, tempStatus, turbStatus);
            
            // Log new ThingSpeak entries to the Alerts tab if there is a warning/danger
            checkAndLogAlerts(isNewEntry);
            
            // Update all 6 charts
            const timeStr = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            pushDataToCharts(timeStr, t.pH, t.tds, t.temperature, t.turbidity, t.waterScore, t.overallStatus);
        }
    } catch (e) {
        console.error("ThingSpeak sync failed", e);
        updateStatusBadge("offline", "ThingSpeak Offline");
    }
}

// --- Load ThingSpeak Historical Feeds onto 6 Charts ---
async function loadThingSpeakHistory(range = "day") {
    const channelId = state.tsChannelId || "3425398";
    const readKey = state.tsReadKey ? state.tsReadKey.trim() : "";
    
    // Build query URL to pull raw data points within the actual historical window
    let url = `https://api.thingspeak.com/channels/${channelId}/feeds.json`;
    if (range === "day") {
        url += "?days=1";
    } else if (range === "week") {
        url += "?days=7";
    } else if (range === "month") {
        url += "?days=30";
    }
    
    if (readKey) {
        url += `&api_key=${readKey}`;
    }
    
    try {
        let response = await fetch(url);
        if (!response.ok) throw new Error("History fetch failed");
        let data = await response.json();
        
        // Fallback: If time-window query returned empty feeds (e.g. inactive channel), load raw recent feeds
        if (!data || !data.feeds || data.feeds.length === 0) {
            console.log(`[ThingSpeak] Days-based query empty for range ${range}, falling back to raw feeds`);
            let fallbackCount = 50;
            if (range === "week") fallbackCount = 150;
            else if (range === "month") fallbackCount = 300;
            
            const fallbackUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?results=${fallbackCount}${readKey ? '&api_key=' + readKey : ''}`;
            const fallbackRes = await fetch(fallbackUrl);
            if (fallbackRes.ok) {
                data = await fallbackRes.json();
            }
        }
        
        if (data && data.feeds) {
            const labels = [];
            const phData = [];
            const tdsData = [];
            const tempData = [];
            const turbData = [];
            const scoreData = [];
            const statusData = [];
            
            const parseVal = (val, def) => {
                if (val === null || val === undefined || val === "") return def;
                const parsed = parseFloat(val);
                return isNaN(parsed) ? def : parsed;
            };
            
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            
            data.feeds.forEach(f => {
                const dateObj = new Date(f.created_at);
                let timeLabel = "";
                
                if (range === "day") {
                    timeLabel = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                } else if (range === "week") {
                    timeLabel = dayNames[dateObj.getDay()] + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                } else {
                    timeLabel = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
                
                labels.push(timeLabel);
                
                const pH = parseVal(f.field1, 7.0);
                const tds = Math.round(parseVal(f.field2, 0));
                const temperature = parseVal(f.field3, 25.0);
                const turbidity = Math.round(parseVal(f.field4, 0));
                
                const healthBitmask = parseInt(f.field7) || 15;
                const phWorking = (healthBitmask & 1) !== 0;
                const tdsWorking = (healthBitmask & 2) !== 0;
                const tempWorking = (healthBitmask & 4) !== 0;
                const turbidityWorking = (healthBitmask & 8) !== 0;
                
                // Re-calculate historical Water Score and Safety Status locally using website thresholds!
                const evalResult = calculateScoreAndStatusLocal(pH, tds, temperature, turbidity, phWorking, tdsWorking, tempWorking, turbidityWorking);
                
                phData.push(pH);
                tdsData.push(tds);
                tempData.push(temperature);
                turbData.push(turbidity);
                scoreData.push(evalResult.waterScore);
                statusData.push(evalResult.overallStatus);
            });
            
            const populateChartData = (chartObj, chartLabels, chartVals) => {
                if (chartObj) {
                    chartObj.data.labels = chartLabels;
                    chartObj.data.datasets[0].data = chartVals;
                    chartObj.update();
                }
            };
            
            populateChartData(state.chart.ph, labels, phData);
            populateChartData(state.chart.tds, labels, tdsData);
            populateChartData(state.chart.temp, labels, tempData);
            populateChartData(state.chart.turb, labels, turbData);
            populateChartData(state.chart.score, labels, scoreData);
            populateChartData(state.chart.status, labels, statusData);
            
            console.log(`[ThingSpeak] Raw historical data loaded (${range}, ${data.feeds.length} pts) onto 6 charts`);
        }
    } catch (e) {
        console.error("ThingSpeak history load failed", e);
    }
}

// --- Reconstruct warnings from fetched values (Fallback/Simulated) ---
function reconstructReasonAndStatus() {
    const t = state.telemetry;
    const c = state.thresholds;
    
    if (!t.phWorking || !t.tdsWorking || !t.tempWorking || !t.turbidityWorking) {
        t.overallStatus = 3;
        t.reason = "Sensor Fault";
        return;
    }
    
    const phStatus = (t.pH >= c.phWarnLow && t.pH <= c.phWarnHigh) ? 0 : ((t.pH < c.phDangerLow || t.pH > c.phDangerHigh) ? 2 : 1);
    const tdsStatus = (t.tds <= c.tdsWarn) ? 0 : (t.tds > c.tdsDanger ? 2 : 1);
    const tempStatus = (t.temperature <= c.tempWarn) ? 0 : (t.temperature > c.tempDanger ? 2 : 1);
    const turbStatus = (t.turbidity <= c.turbWarn) ? 0 : (t.turbidity > c.turbDanger ? 2 : 1);
    
    let warnings = [];
    if (phStatus !== 0) warnings.push(t.pH < c.phWarnLow ? "Low pH" : "High pH");
    if (tdsStatus !== 0) warnings.push("High TDS");
    if (tempStatus !== 0) warnings.push("High Temp");
    if (turbStatus !== 0) warnings.push("High Turb");
    
    if (warnings.length === 0) {
        t.overallStatus = 0;
        t.reason = "Water quality is within optimal guidelines.";
    } else {
        t.overallStatus = (phStatus === 2 || tdsStatus === 2 || tempStatus === 2 || turbStatus === 2) ? 2 : 1;
        t.reason = warnings.join(" & ");
    }
}

// --- Startup Modal Controls ---
function showStartupModal() {
    const modal = document.getElementById("startup-modal");
    if (modal) {
        // Pre-fill inputs with current state/saved values
        document.getElementById("modal-ts-channel").value = state.tsChannelId || "3425398";
        document.getElementById("modal-ts-read-key").value = state.tsReadKey || "";
        modal.style.display = "flex";
    }
}

function handleModalConnect() {
    const channelInput = document.getElementById("modal-ts-channel").value.trim();
    const readKeyInput = document.getElementById("modal-ts-read-key").value.trim();
    
    if (!channelInput) {
        alert("Please enter a valid ThingSpeak Channel ID.");
        return;
    }
    
    state.tsChannelId = channelInput;
    state.tsReadKey = readKeyInput;
    state.dbMode = "thingspeak";
    
    // Save to cookies with 3 months (90 days) expiry
    setCookie("ts_channel_id", channelInput, 90);
    setCookie("ts_read_key", readKeyInput, 90);
    setCookie("db_mode", "thingspeak", 90);
    
    // Close modal
    document.getElementById("startup-modal").style.display = "none";
    
    // Connect live sync
    linkThingSpeakStartup();
}

function handleModalSimulate() {
    state.dbMode = "simulated";
    
    // Save state in cookies
    setCookie("db_mode", "simulated", 90);
    
    // Close modal
    document.getElementById("startup-modal").style.display = "none";
    
    // Stop sync timers
    if (state.tsInterval) {
        clearInterval(state.tsInterval);
        state.tsInterval = null;
    }
    
    updateStatusBadge("offline", "ESP32: Simulated");
    evaluateQuality();
    generateSimulatedHistory(state.analyticsRange || "day");
}

function linkThingSpeakStartup() {
    // Hide startup modal since connection details are loaded
    const modal = document.getElementById("startup-modal");
    if (modal) modal.style.display = "none";

    // Stop previous sync loops
    if (state.tsInterval) {
        clearInterval(state.tsInterval);
    }
    
    // Connect and run immediately
    syncThingSpeak();
    loadThingSpeakHistory(state.analyticsRange || "day");
    
    // Poller loop every 15s
    state.tsInterval = setInterval(syncThingSpeak, 15000);
}

// --- Math Mapping Helpers ---
function mapFloat(x, in_min, in_max, out_min, out_max) {
    if (in_max === in_min) return out_min;
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

// --- Storage/Cookie Helpers (3 Months Expiry with LocalStorage Fallback) ---
function setCookie(name, value, days = 90) {
    // Save to LocalStorage as a fallback (essential for file:// protocol where cookies are blocked)
    try {
        localStorage.setItem(name, value || "");
    } catch (e) {
        console.error("LocalStorage write failed", e);
    }

    // Also write standard cookie if not running locally via file://
    if (window.location.protocol !== "file:") {
        try {
            let expires = "";
            if (days) {
                const date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                expires = "; expires=" + date.toUTCString();
            }
            document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax; Secure";
        } catch (e) {
            console.error("Cookie write failed", e);
        }
    }
}

function getCookie(name) {
    // Attempt standard cookie read first (if not on local file://)
    if (window.location.protocol !== "file:") {
        try {
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            for (let i = 0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) == ' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
            }
        } catch (e) {
            console.error("Cookie read failed", e);
        }
    }
    
    // Fall back to LocalStorage
    try {
        return localStorage.getItem(name);
    } catch (e) {
        console.error("LocalStorage read failed", e);
        return null;
    }
}

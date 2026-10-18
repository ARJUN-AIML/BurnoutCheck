// Show hint tooltip on click (mobile-friendly)
function showHint(event, message) {
  event.stopPropagation();

  // Remove any existing tooltips
  const existingTooltip = document.querySelector('.hint-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
    return; // Toggle off if clicking the same icon
  }

  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'hint-tooltip';
  tooltip.textContent = message;
  document.body.appendChild(tooltip);

  // Position the tooltip near the clicked element
  const rect = event.target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  // Calculate position (try to center below the icon)
  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
  let top = rect.bottom + 8;

  // Adjust if tooltip goes off-screen
  if (left + tooltipRect.width > window.innerWidth - 16) {
    left = window.innerWidth - tooltipRect.width - 16;
  }
  if (left < 16) {
    left = 16;
  }

  // If tooltip would go below viewport, show it above the icon instead
  if (top + tooltipRect.height > window.innerHeight - 16) {
    top = rect.top - tooltipRect.height - 8;
  }

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';

  // Remove tooltip when clicking anywhere else
  setTimeout(() => {
    document.addEventListener('click', function removeTooltip() {
      tooltip.remove();
      document.removeEventListener('click', removeTooltip);
    });
  }, 100);
}

// Clamp input values to prevent invalid entries
function clampValue(input, min, max) {
  let value = parseFloat(input.value);

  // Prevent negative values
  if (value < min) {
    input.value = min;
  }
  // Prevent values exceeding max
  else if (value > max) {
    input.value = max;
  }
}

function analyze() {
  const btn = document.getElementById("analyzeBtn");
  btn.innerText = "Analyzing...";
  btn.disabled = true;

  setTimeout(() => {
    runAnalysis();
    btn.innerText = "Run Assessment";
    btn.disabled = false;
  }, 900);
}

function runAnalysis() {
  const sleep = Number(document.getElementById("sleep").value);
  const breaks = Number(document.getElementById("breaks").value);
  const screen = Number(document.getElementById("screen").value);
  const pressure = Number(document.getElementById("pressure").value);
  const stress = Number(document.getElementById("stress").value);
  const motivation = Number(document.getElementById("motivation").value);

  let signals = [];
  let actions = [];
  let risk = "Low";

  // Calculate derived metrics for more nuanced analysis
  const recoveryScore = (sleep / 8) * 2 + (2 - breaks);
  const loadScore = (screen / 12) * 2 + pressure;
  const mentalStateScore = stress - motivation;
  const totalStrain = stress + pressure + (screen / 4) - (sleep / 2);

  // === PATTERN 1: Critical Burnout (High stress + Low motivation) ===
  if (stress >= 4 && motivation <= 2) {
    risk = "High";

    if (sleep < 5) {
      signals.push("Severe burnout pattern: High stress, low motivation, and sleep deprivation");
      actions.push("URGENT: Prioritize 8+ hours of sleep tonight - this is non-negotiable");
      actions.push("Consider taking a mental health day if possible");
    } else if (sleep >= 7) {
      signals.push("Classic burnout despite adequate sleep - likely workload or meaning crisis");
      actions.push("Reassess your current goals and whether they align with your values");
      actions.push("Talk to a counselor or trusted mentor about your workload");
    } else {
      signals.push("High stress with low motivation - entering burnout zone");
      actions.push("Increase sleep to 7+ hours and reduce non-essential commitments");
    }

    if (screen > 10) {
      signals.push("Digital overload compounding your burnout symptoms");
      actions.push("Implement a strict 'no screens after 9 PM' rule");
    }

    if (breaks === 2) {
      actions.push("Start taking 5-minute breaks every hour - set phone alarms");
    }
  }

  // === PATTERN 2: Overdrive/Hustle Culture (High stress + High motivation) ===
  else if (stress >= 4 && motivation >= 4) {
    risk = sleep < 6 ? "High" : "Medium";

    if (sleep < 6) {
      signals.push("Dangerous overdrive state: Running on adrenaline, not sustainable");
      actions.push("You're headed for a crash - schedule rest days NOW");
      actions.push("Your body will force you to stop if you don't choose to");
    } else if (pressure === 2 && screen > 9) {
      signals.push("High-performance mode with heavy digital load");
      actions.push("Schedule 'deep work' blocks with zero distractions");
      actions.push("Use blue light filters and take eye breaks every 20 minutes");
    } else {
      signals.push("High energy but unsustainable stress levels detected");
      actions.push("Build in recovery time before you need it");
      actions.push("Practice saying 'no' to new commitments this week");
    }

    if (breaks === 0) {
      signals.push("Good break habits, but may need longer recovery periods");
      actions.push("Add one 30-minute 'do nothing' break to your daily routine");
    }
  }

  // === PATTERN 3: Disconnection/Apathy (Low stress + Low motivation) ===
  else if (stress <= 2 && motivation <= 2) {
    risk = "Medium";

    if (sleep > 9) {
      signals.push("Oversleeping with low energy - possible depression or avoidance");
      actions.push("Consult a healthcare provider about persistent low energy");
      actions.push("Try waking at the same time daily, even on weekends");
    } else if (screen > 8 && pressure === 0) {
      signals.push("Disconnection pattern: Low engagement with low pressure");
      actions.push("Reconnect with what originally excited you about your studies");
      actions.push("Set one small, achievable goal for tomorrow");
    } else {
      signals.push("Low stress but also low drive - possible meaning gap");
      actions.push("Reflect on your 'why' - what are you working toward?");
      actions.push("Try a new learning method or study environment");
    }

    if (breaks === 2) {
      signals.push("Lack of structured breaks may be contributing to mental fog");
      actions.push("Use the Pomodoro technique to create rhythm in your day");
    }
  }

  // === PATTERN 4: Optimal Performance (Low stress + High motivation) ===
  else if (stress <= 2 && motivation >= 4) {
    risk = "Low";

    if (sleep >= 7 && breaks === 0 && screen < 8) {
      signals.push("Excellent balance: Low stress, high motivation, good habits");
      actions.push("You're in a flow state - maintain these habits!");
      actions.push("Document what's working so you can return to it later");
    } else if (screen > 10) {
      signals.push("Great mental state but high screen time may cause future strain");
      actions.push("Protect your eyes with the 20-20-20 rule (every 20 min, look 20 feet away for 20 sec)");
    } else {
      signals.push("Healthy state with room for optimization");
      actions.push("Keep up your current routine and consider mentoring others");
    }
  }

  // === PATTERN 5: Moderate Stress + Variable Motivation ===
  else if (stress === 3) {
    risk = motivation <= 2 ? "Medium" : "Low";

    if (motivation <= 2) {
      signals.push("Moderate stress starting to erode motivation");
      actions.push("This is the prevention window - act now before it escalates");
      actions.push("Identify your top 3 stressors and tackle the easiest one first");
    } else if (motivation >= 4) {
      signals.push("Balanced state with manageable stress levels");
      actions.push("Monitor your energy levels and adjust workload proactively");
    } else {
      signals.push("Neutral zone - neither thriving nor struggling");
      actions.push("Small improvements in sleep or breaks could boost your state significantly");
    }
  }

  // === SLEEP-SPECIFIC PATTERNS ===
  if (sleep < 5 && !signals.some(s => s.includes("sleep"))) {
    signals.push(`Critical sleep deficit (${sleep}h) - affecting cognitive function`);
    actions.push("Sleep deprivation compounds all other issues - make this priority #1");
  } else if (sleep >= 5 && sleep < 6.5) {
    signals.push("Suboptimal sleep reducing your resilience to stress");
    actions.push("Aim for 7-8 hours - even 30 minutes more makes a difference");
  } else if (sleep > 9 && stress <= 2) {
    signals.push("Excessive sleep may indicate avoidance or underlying health issue");
  }

  // === SCREEN TIME PATTERNS ===
  if (screen > 12) {
    if (!signals.some(s => s.includes("screen") || s.includes("digital"))) {
      signals.push("Extreme screen exposure (>12h) - high risk for eye strain and mental fatigue");
    }
    actions.push("Use f.lux or Night Shift mode, and take hourly movement breaks");
  } else if (screen >= 8 && screen <= 10 && sleep < 7) {
    signals.push("Screen time + poor sleep = reduced recovery quality");
    actions.push("Stop screen use 90 minutes before bed for better sleep");
  } else if (screen < 4 && motivation >= 4) {
    signals.push("Low screen time with high motivation - great balance!");
  }

  // === PRESSURE + BREAKS INTERACTION ===
  if (pressure === 2 && breaks === 2) {
    signals.push("High pressure without breaks - recipe for rapid burnout");
    actions.push("Breaks aren't optional under high pressure - they're essential");
  } else if (pressure === 0 && motivation <= 2) {
    signals.push("Low external pressure but also low internal drive");
    actions.push("Create self-imposed deadlines or accountability partnerships");
  }

  // === RECOVERY vs LOAD BALANCE ===
  if (recoveryScore < 2 && loadScore > 3) {
    signals.push("Load significantly exceeds recovery capacity");
    actions.push("Either reduce load or increase recovery - current ratio is unsustainable");
  } else if (recoveryScore > 3 && loadScore < 2 && motivation <= 2) {
    signals.push("Adequate recovery but low engagement - may need more challenge");
    actions.push("Consider taking on a passion project or new learning goal");
  }

  // === UNIQUE COMBINATION PATTERNS ===
  if (stress === 5 && motivation === 1 && sleep < 5) {
    signals.push("Critical triple threat: Maximum stress, minimum motivation, severe sleep debt");
    actions.push("STOP: You need immediate intervention - talk to someone TODAY");
  }

  if (stress === 1 && motivation === 5 && sleep >= 7 && breaks === 0) {
    signals.push("Peak performance state - you're operating optimally!");
    actions.push("Share your routine with others and protect this balance fiercely");
  }

  if (screen > 14 && sleep < 6 && stress >= 4) {
    signals.push("Digital burnout pattern: Excessive screen time disrupting sleep and amplifying stress");
    actions.push("Implement a complete digital detox for 24 hours this weekend");
  }

  // === FALLBACK FOR UNIQUE CASES ===
  if (signals.length === 0) {
    signals.push(`Moderate state: Stress ${stress}/5, Motivation ${motivation}/5, Sleep ${sleep}h`);
    actions.push("You're in a stable zone - small tweaks can optimize further");

    if (sleep < 7) actions.push("Increase sleep by 30-60 minutes for better resilience");
    if (breaks >= 1) actions.push("Add structured breaks to improve focus and recovery");
    if (screen > 6) actions.push("Reduce screen time by 1-2 hours for better mental clarity");
  }

  // === ML ENSEMBLE PREDICTION ===
  // Risk level now comes from the 4-model ensemble (logistic regression,
  // MLP neural net, random forest, k-NN). The rule engine above still
  // provides the explainable patterns/suggestions, and doubles as a
  // fallback if the model artifact failed to load.
  const hasML = typeof BurnoutML !== "undefined" && typeof BURNOUT_MODEL !== "undefined";
  const rawInputs = { sleep, breaks, screen, pressure, stress, motivation };
  let ml = null;
  let explanation = null;
  if (hasML) {
    ml = BurnoutML.predict(rawInputs, BURNOUT_MODEL);
    explanation = BurnoutML.explain(rawInputs, BURNOUT_MODEL);
  }
  const finalRisk = ml ? ml.label : risk;

  // === DISPLAY RESULTS ===
  document.getElementById("result").classList.remove("hidden");
  const riskEl = document.getElementById("riskLevel");
  riskEl.className = ml ? `risk level-${ml.classIndex}` : "risk";
  riskEl.innerText = ml
    ? `Burnout Risk Level: ${finalRisk} · risk index ${Math.round(ml.riskIndex * 100)}/100`
    : `Burnout Risk Level: ${finalRisk}`;

  renderList("signalList", signals);
  renderList("actionsList", actions);

  if (ml) {
    renderMLResult(ml, explanation);
  } else {
    // Graceful degradation without the model artifact
    document.getElementById("meterWrap").classList.add("hidden");
    document.getElementById("driversWrap").classList.add("hidden");
    document.getElementById("modelDetails").classList.add("hidden");
    document.getElementById("mlMeta").innerText =
      "Model unavailable — showing rule-based result.";
    document.getElementById("confidence").innerText =
      "Assessment confidence: rules only (ML model artifact did not load)";
  }
}

// Render risk meter, model meta line, driver bars and model details
function renderMLResult(ml, explanation) {
  const model = BURNOUT_MODEL;
  const metrics = model.metrics.test;

  // Risk meter animates to the ensemble's risk index
  const meter = document.getElementById("riskMeter");
  meter.style.width = "0%";
  meter.className = "level-" + ml.classIndex;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      meter.style.width = `${Math.round(ml.riskIndex * 100)}%`;
    });
  });

  document.getElementById("mlMeta").innerText =
    `4-model ensemble · ${ml.votes}/4 models agree · confidence ${ml.confidence} ` +
    `(${Math.round(ml.confidenceScore * 100)}%)`;

  // What's driving the score (occlusion-based contributions)
  const ul = document.getElementById("driverList");
  ul.innerHTML = "";
  const top = explanation.contributions.filter((c) => Math.abs(c.delta) >= 0.01).slice(0, 5);

  if (top.length === 0) {
    const li = document.createElement("li");
    li.className = "driver";
    li.innerText = "No single input dominates — your inputs sit close to neutral baselines.";
    ul.appendChild(li);
  } else {
    // Bars scale against the strongest driver so relative weight is legible
    const maxAbs = Math.max(...top.map((c) => Math.abs(c.delta)), 1e-9);
    top.forEach((c, i) => {
      const pts = Math.max(1, Math.round(Math.abs(c.delta) * 100));
      const pct = Math.max(8, Math.round((Math.abs(c.delta) / maxAbs) * 100));
      const dir = c.delta >= 0 ? "up" : "down";
      const action = BurnoutML.FEEDBACK[c.feature];
      const li = document.createElement("li");
      li.className = "driver";
      li.style.animationDelay = `${0.1 * (i + 1)}s`;

      const wrap = document.createElement("span");
      wrap.className = "driver-bar-wrap";
      const bar = document.createElement("span");
      bar.className = `driver-bar ${dir}`;
      bar.style.width = `${pct}%`;
      wrap.appendChild(bar);

      const text = document.createElement("span");
      text.className = "driver-text";
      text.innerText = `${c.label} ${dir === "up" ? "raises" : "lowers"} your score ~${pts} pts${
        action ? ` — ${action}` : ""
      }`;

      li.appendChild(wrap);
      li.appendChild(text);
      ul.appendChild(li);
    });
  }

  document.getElementById("confidence").innerText =
    `Assessment confidence: ${ml.confidence} — ${ml.votes}/4 models agree; ensemble accuracy ` +
    `${(metrics.ensemble.accuracy * 100).toFixed(1)}% on held-out test data`;

  // "How the prediction works" details block
  document.getElementById("modelBlurb").innerText =
    `The risk level comes from an ensemble of four models trained offline and run entirely in your browser — ` +
    `no data leaves this page. The patterns and suggestions above come from the rule-based explainer. ` +
    `On held-out test data the ensemble reached ${(metrics.ensemble.accuracy * 100).toFixed(1)}% accuracy ` +
    `versus ${(metrics.legacyRules.accuracy * 100).toFixed(1)}% for the previous rule logic ` +
    `(theoretical maximum for this label noise: ${(metrics.bayesCeiling * 100).toFixed(1)}%).`;

  const rows = [
    ["Ensemble (4 models)", metrics.ensemble],
    ["MLP neural network", metrics.models.mlp],
    ["Random forest (60 trees)", metrics.models.forest],
    ["Logistic regression", metrics.models.logistic],
    ["k-nearest neighbours (k=25)", metrics.models.knn],
    ["Previous rule-based logic", metrics.legacyRules]
  ];
  const table = document.getElementById("modelTable");
  table.innerHTML =
    "<thead><tr><th>Model</th><th>Accuracy</th><th>Macro F1</th></tr></thead><tbody>" +
    rows
      .map(
        ([name, m]) =>
          `<tr><td>${name}</td><td>${(m.accuracy * 100).toFixed(1)}%</td><td>${m.macroF1.toFixed(3)}</td></tr>`
      )
      .join("") +
    "</tbody>";

  document.getElementById("modelDisclaimer").innerText =
    `Accuracy figures are from ${(model.meta.nTest).toLocaleString()} held-out samples of a synthetic dataset ` +
    `generated from a research-informed labeling function (stress, pressure, sleep, screen time, breaks, ` +
    `motivation → MBI-SS-style burnout dimensions). They measure agreement with that labeling process, ` +
    `not clinical validity. BurnoutCheck remains an awareness tool, not a diagnostic one.`;
}

function renderList(id, items) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  items.forEach(text => {
    const li = document.createElement("li");
    li.innerText = text;
    ul.appendChild(li);
  });
}

function toggleTheme() {
  const body = document.body;
  const toggle = document.querySelector(".theme-toggle");
  body.classList.toggle("dark");
  toggle.setAttribute("aria-pressed", body.classList.contains("dark") ? "true" : "false");
}

function downloadReport() {
  const sleep = Number(document.getElementById("sleep").value);
  const breaks = Number(document.getElementById("breaks").value);
  const screen = Number(document.getElementById("screen").value);
  const pressure = Number(document.getElementById("pressure").value);
  const stress = Number(document.getElementById("stress").value);
  const motivation = Number(document.getElementById("motivation").value);

  const riskLevel = document.getElementById("riskLevel").innerText;
  const confidence = document.getElementById("confidence").innerText;
  const mlMeta = document.getElementById("mlMeta").innerText;
  const signals = [...document.querySelectorAll("#signalList li")].map(li => li.innerText);
  const actions = [...document.querySelectorAll("#actionsList li")].map(li => li.innerText);
  const drivers = [...document.querySelectorAll("#driverList li")].map(li => li.innerText);

  const driversSection = drivers.length
    ? `<div class="section">
        <h2>What drove the score</h2>
        <ul class="signals-list">
          ${drivers.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>`
    : "";

  const riskBadgeClass = /Risk Level: Low/.test(riskLevel)
    ? "level-0"
    : /Risk Level: Medium/.test(riskLevel)
      ? "level-1"
      : /Risk Level: High/.test(riskLevel)
        ? "level-2"
        : "";

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Map numeric values to readable text
  const breaksText = breaks === 0 ? 'Yes' : breaks === 1 ? 'Sometimes' : 'Rarely';
  const pressureText = pressure === 0 ? 'Low' : pressure === 1 ? 'Moderate' : 'High';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BurnoutCheck — Assessment report</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f7f8fa;
      color: #101828;
      padding: 32px 16px;
      font-size: 14px;
      line-height: 1.55;
    }

    .container {
      max-width: 760px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e4e7ec;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
    }

    .header {
      padding: 28px 32px 22px;
      border-bottom: 1px solid #e4e7ec;
    }

    .header h1 {
      font-size: 20px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .header .subtitle {
      margin-top: 2px;
      font-size: 13px;
      color: #667085;
    }

    .header .timestamp {
      margin-top: 10px;
      font-size: 12px;
      color: #98a2b3;
    }

    .content { padding: 28px 32px 8px; }

    .risk-badge {
      display: inline-flex;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      background: #f2f4f7;
      color: #344054;
      border: 1px solid #d0d5dd;
    }

    .risk-badge.level-0 { background: #ecfdf3; color: #067647; border-color: #abefc6; }
    .risk-badge.level-1 { background: #fffaeb; color: #b54708; border-color: #fedf89; }
    .risk-badge.level-2 { background: #fef3f2; color: #b42318; border-color: #fecdca; }

    .meta-line {
      margin: 10px 0 0;
      font-size: 13px;
      color: #667085;
    }

    .section { margin-top: 28px; }

    .section h2 {
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e4e7ec;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #667085;
    }

    .input-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }

    .input-item {
      padding: 10px 12px;
      background: #f9fafb;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
    }

    .input-item .label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #667085;
    }

    .input-item .value {
      margin-top: 2px;
      font-size: 14px;
      font-weight: 600;
      color: #101828;
    }

    ul { list-style: none; }

    li {
      position: relative;
      padding: 9px 0 9px 16px;
      border-bottom: 1px solid #f2f4f7;
    }

    li:last-child { border-bottom: 0; }

    li::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 17px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #98a2b3;
    }

    .actions-list li::before {
      content: '→';
      top: 8px;
      width: auto;
      height: auto;
      background: none;
      color: #667085;
      font-size: 12px;
    }

    .confidence {
      margin-top: 24px;
      padding: 12px 14px;
      background: #f9fafb;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      font-size: 13px;
      color: #475467;
    }

    .footer {
      margin-top: 28px;
      padding: 20px 32px;
      border-top: 1px solid #e4e7ec;
      font-size: 12px;
      color: #667085;
    }

    .footer p { margin-bottom: 6px; }
    .footer p:last-child { margin-bottom: 0; }

    .print-button {
      margin-top: 18px;
      padding: 10px 18px;
      background: #1d4ed8;
      color: #ffffff;
      border: 0;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .print-button:hover { background: #1a44bd; }

    @media print {
      body { background: #ffffff; padding: 0; }
      .container { border: 0; border-radius: 0; box-shadow: none; }
      .print-button { display: none; }
    }

    @media (max-width: 768px) {
      body { padding: 12px; }
      .header { padding: 20px; }
      .content { padding: 20px; }
      .footer { padding: 16px 20px; }
      .input-grid { grid-template-columns: 1fr; }
      .header h1 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BurnoutCheck</h1>
      <p class="subtitle">Personal burnout assessment report</p>
      <p class="timestamp">Generated ${dateStr} at ${timeStr}</p>
    </div>

    <div class="content">
      <div class="risk-badge ${riskBadgeClass}">${riskLevel}</div>
      <p class="meta-line">${mlMeta}</p>

      <div class="section">
        <h2>Your inputs</h2>
        <div class="input-grid">
          <div class="input-item">
            <div class="label">Sleep</div>
            <div class="value">${sleep} hours</div>
          </div>
          <div class="input-item">
            <div class="label">Breaks</div>
            <div class="value">${breaksText}</div>
          </div>
          <div class="input-item">
            <div class="label">Screen time</div>
            <div class="value">${screen} hours</div>
          </div>
          <div class="input-item">
            <div class="label">Study/work pressure</div>
            <div class="value">${pressureText}</div>
          </div>
          <div class="input-item">
            <div class="label">Stress</div>
            <div class="value">${stress}/5</div>
          </div>
          <div class="input-item">
            <div class="label">Motivation</div>
            <div class="value">${motivation}/5</div>
          </div>
        </div>
      </div>

      ${driversSection}

      <div class="section">
        <h2>Patterns we noticed</h2>
        <ul class="signals-list">
          ${signals.map(signal => `<li>${signal}</li>`).join('')}
        </ul>
      </div>

      <div class="section">
        <h2>Recommended actions</h2>
        <ul class="actions-list">
          ${actions.map(action => `<li>${action}</li>`).join('')}
        </ul>
      </div>

      <div class="confidence">
        ${confidence}
      </div>

      <button class="print-button" onclick="window.print()">Print or save as PDF</button>
    </div>

    <div class="footer">
      <p><strong>Important:</strong> This tool is for awareness and self-reflection only. It does not constitute medical advice.</p>
      <p>If you are experiencing prolonged burnout symptoms, please talk to a healthcare professional or counselor.</p>
      <p>BurnoutCheck — a self-check, not a diagnosis.</p>
    </div>
  </div>
</body>
</html>
`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `BurnoutCheck-Report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const inputs = document.querySelectorAll("input, select");
const analyzeBtn = document.getElementById("analyzeBtn");

function updateState() {
  const filled = [...inputs].filter(el => {
    if (el.value === "") return false;

    // Validate number inputs (Sleep & Screen time)
    if (el.type === "number") {
      const val = Number(el.value);
      return val >= 0 && val <= 24;
    }

    return true;
  }).length;

  const progress = (filled / inputs.length) * 100;

  document.getElementById("progressBar").style.width = `${progress}%`;

  // Only enable button if form is complete
  analyzeBtn.disabled = progress < 100;
}

// Attach listeners and run initial check
inputs.forEach(i => {
  i.addEventListener("input", updateState);
  i.addEventListener("change", updateState); // For select elements
});

// Run once on load to set initial state
updateState();

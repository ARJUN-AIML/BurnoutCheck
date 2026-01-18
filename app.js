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

  // === CONFIDENCE CALCULATION ===
  const dataPoints = [sleep, breaks, screen, pressure, stress, motivation].filter(v => v !== null && v !== "").length;
  const confidence = dataPoints === 6 ? "High" : dataPoints >= 4 ? "Moderate" : "Low";

  // === DISPLAY RESULTS ===
  document.getElementById("result").classList.remove("hidden");
  document.getElementById("riskLevel").innerText = `Burnout Risk Level: ${risk}`;

  renderList("signalList", signals);
  renderList("actionsList", actions);

  document.getElementById("confidence").innerText =
    `Assessment confidence: ${confidence} (based on ${dataPoints}/6 inputs)`;
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
  const icon = document.getElementById("themeIcon");
  const toggle = document.querySelector(".theme-toggle");

  toggle.classList.add("animate");

  setTimeout(() => {
    body.classList.toggle("dark");
    icon.textContent = body.classList.contains("dark") ? "☀️" : "🌙";
    toggle.classList.remove("animate");
  }, 200);
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
  const signals = [...document.querySelectorAll("#signalList li")].map(li => li.innerText);
  const actions = [...document.querySelectorAll("#actionsList li")].map(li => li.innerText);

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
  <title>BurnoutCheck Assessment Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      color: #1f2937;
      line-height: 1.6;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white;
      padding: 40px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 10px;
    }
    
    .header .subtitle {
      font-size: 1.1rem;
      opacity: 0.9;
    }
    
    .header .timestamp {
      margin-top: 20px;
      font-size: 0.9rem;
      opacity: 0.8;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      padding-top: 15px;
    }
    
    .content {
      padding: 40px;
    }
    
    .risk-badge {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 1.1rem;
      margin-bottom: 30px;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white;
      box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3);
    }
    
    .section {
      margin-bottom: 35px;
    }
    
    .section h2 {
      font-size: 1.5rem;
      color: #4f46e5;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .section h2::before {
      content: '';
      width: 6px;
      height: 24px;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      border-radius: 3px;
    }
    
    .input-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .input-item {
      background: #f9fafb;
      padding: 15px;
      border-radius: 10px;
      border-left: 4px solid #4f46e5;
    }
    
    .input-item .label {
      font-size: 0.85rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    
    .input-item .value {
      font-size: 1.3rem;
      font-weight: 600;
      color: #1f2937;
    }
    
    ul {
      list-style: none;
      padding: 0;
    }
    
    li {
      background: #f9fafb;
      padding: 15px 20px;
      margin-bottom: 12px;
      border-radius: 10px;
      border-left: 4px solid #4f46e5;
      position: relative;
      padding-left: 45px;
    }
    
    li::before {
      content: '✓';
      position: absolute;
      left: 15px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: bold;
    }
    
    .actions-list li::before {
      content: '→';
      font-size: 1.2rem;
    }
    
    .confidence {
      background: #eff6ff;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      font-weight: 600;
      color: #1e40af;
      border: 2px dashed #4f46e5;
    }
    
    .footer {
      background: #f9fafb;
      padding: 30px;
      text-align: center;
      color: #6b7280;
      font-size: 0.9rem;
      border-top: 1px solid #e5e7eb;
    }
    
    .footer strong {
      color: #1f2937;
    }
    
    .print-button {
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 20px;
      box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3);
      transition: transform 0.2s ease;
    }
    
    .print-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .print-button {
        display: none;
      }
    }
    
    @media (max-width: 768px) {
      body {
        padding: 10px;
      }
      
      .container {
        border-radius: 12px;
      }
      
      .header {
        padding: 25px 20px;
      }
      
      .header h1 {
        font-size: 1.8rem;
      }
      
      .header .subtitle {
        font-size: 0.95rem;
      }
      
      .header .timestamp {
        font-size: 0.8rem;
        margin-top: 15px;
        padding-top: 12px;
      }
      
      .content {
        padding: 20px 15px;
      }
      
      .risk-badge {
        padding: 10px 20px;
        font-size: 1rem;
        margin-bottom: 20px;
      }
      
      .section {
        margin-bottom: 25px;
      }
      
      .section h2 {
        font-size: 1.2rem;
        margin-bottom: 12px;
        padding-bottom: 8px;
      }
      
      .section h2::before {
        width: 4px;
        height: 20px;
      }
      
      .input-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      
      .input-item {
        padding: 12px;
        border-left-width: 3px;
      }
      
      .input-item .label {
        font-size: 0.75rem;
        margin-bottom: 4px;
      }
      
      .input-item .value {
        font-size: 1.1rem;
      }
      
      li {
        padding: 12px 15px;
        padding-left: 40px;
        margin-bottom: 10px;
        font-size: 0.9rem;
        border-left-width: 3px;
      }
      
      li::before {
        width: 20px;
        height: 20px;
        left: 12px;
        font-size: 0.7rem;
      }
      
      .actions-list li::before {
        font-size: 1rem;
      }
      
      .confidence {
        padding: 15px;
        font-size: 0.9rem;
      }
      
      .print-button {
        padding: 10px 20px;
        font-size: 0.9rem;
        margin-top: 15px;
        width: 100%;
      }
      
      .footer {
        padding: 20px 15px;
        font-size: 0.8rem;
      }
      
      .footer p {
        margin-bottom: 8px;
      }
      
      .footer br {
        display: none;
      }
    }
    
    @media (max-width: 480px) {
      .header h1 {
        font-size: 1.5rem;
      }
      
      .header .subtitle {
        font-size: 0.85rem;
      }
      
      .input-grid {
        grid-template-columns: 1fr;
        gap: 10px;
      }
      
      .section h2 {
        font-size: 1.1rem;
      }
      
      li {
        font-size: 0.85rem;
        padding: 10px 12px;
        padding-left: 35px;
      }
      
      li::before {
        width: 18px;
        height: 18px;
        left: 10px;
        font-size: 0.65rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧠 BurnoutCheck</h1>
      <p class="subtitle">Personal Burnout Assessment Report</p>
      <div class="timestamp">
        Generated on ${dateStr} at ${timeStr}
      </div>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <div class="risk-badge">${riskLevel}</div>
      </div>
      
      <div class="section">
        <h2>Your Inputs</h2>
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
            <div class="label">Screen Time</div>
            <div class="value">${screen} hours</div>
          </div>
          <div class="input-item">
            <div class="label">Study/Work Pressure</div>
            <div class="value">${pressureText}</div>
          </div>
          <div class="input-item">
            <div class="label">Stress Level</div>
            <div class="value">${stress}/5</div>
          </div>
          <div class="input-item">
            <div class="label">Motivation</div>
            <div class="value">${motivation}/5</div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h2>Patterns We Noticed</h2>
        <ul class="signals-list">
          ${signals.map(signal => `<li>${signal}</li>`).join('')}
        </ul>
      </div>
      
      <div class="section">
        <h2>Recommended Actions</h2>
        <ul class="actions-list">
          ${actions.map(action => `<li>${action}</li>`).join('')}
        </ul>
      </div>
      
      <div class="confidence">
        ${confidence}
      </div>
      
      <div style="text-align: center;">
        <button class="print-button" onclick="window.print()">📄 Print or Save as PDF</button>
      </div>
    </div>
    
    <div class="footer">
      <p><strong>Important Disclaimer:</strong> This tool is for awareness and self-reflection only.</p>
      <p>It does not constitute medical advice. If you're experiencing persistent burnout symptoms,<br>please consult a healthcare professional or counselor.</p>
      <p style="margin-top: 15px; color: #4f46e5; font-weight: 600;">BurnoutCheck - Approximate mental health analysis</p>
    </div>
  </div>
</body>
</html>`;

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

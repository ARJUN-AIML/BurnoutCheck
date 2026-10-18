/**
 * End-to-end DOM test of the real page in jsdom: loads index.html with its
 * actual script tags (ml/engine.js, ml/model.js, app.js), fills the form
 * the way a user would, clicks "Run Assessment", and asserts the rendered
 * ML result — risk level, risk meter, driver bars, model table, report.
 *
 * jsdom is a dev-only dependency (the app itself needs nothing):
 *   npm install jsdom
 *   node ml/dom-test.js
 */
"use strict";

const path = require("path");
const fs = require("fs");

function loadJsdom() {
  const tried = [];
  for (const c of ["jsdom", process.env.JSDOM_MODULE].filter(Boolean)) {
    try {
      return require(c);
    } catch (e) {
      tried.push(c);
    }
  }
  console.error(`jsdom not found (tried: ${tried.join(", ")}). Install with: npm install jsdom`);
  process.exit(2);
}

const { JSDOM, VirtualConsole, requestInterceptor } = loadJsdom();

let passed = 0,
  failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Block remote subresources (Google Fonts) so the test proves the app works
// fully offline; local scripts/styles still load normally.
const resources =
  typeof requestInterceptor === "function"
    ? {
        interceptors: [
          requestInterceptor((request) =>
            request.url.startsWith("file:")
              ? undefined // load local scripts/styles normally
              : new Response("/* blocked offline */", {
                  status: 200,
                  headers: { "Content-Type": "text/css" }
                })
          )
        ]
      }
    : "usable";

async function main() {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on("jsdomError", (e) => pageErrors.push(String((e && e.stack) || e)));
  vc.on("error", (...args) => pageErrors.push(args.map(String).join(" ")));

  const dom = new JSDOM(html, {
    url: "file://" + path.join(root, "index.html"),
    runScripts: "dangerously",
    resources,
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;

  // jsdom does not implement layout-dependent innerText; alias it safely
  if (!("innerText" in win.HTMLElement.prototype)) {
    Object.defineProperty(win.HTMLElement.prototype, "innerText", {
      get() {
        return this.textContent;
      },
      set(v) {
        this.textContent = v;
      },
      configurable: true
    });
  }

  await new Promise((resolve) => {
    if (win.document.readyState === "complete") resolve();
    else win.addEventListener("load", resolve);
  });
  await sleep(50);

  console.log("\n[1] Page boot");
  check("no page/script errors on load", pageErrors.length === 0, pageErrors[0]);
  check("BurnoutML engine loaded", typeof win.BurnoutML === "object");
  check("BURNOUT_MODEL artifact loaded", typeof win.BURNOUT_MODEL === "object");
  check("analyze() exposed", typeof win.analyze === "function");
  check("risk meter element present", !!win.document.getElementById("riskMeter"));

  const setField = (id, value) => {
    const el = win.document.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
  };

  const fill = (v) => {
    setField("sleep", v.sleep);
    setField("breaks", v.breaks);
    setField("screen", v.screen);
    setField("pressure", v.pressure);
    setField("stress", v.stress);
    setField("motivation", v.motivation);
  };

  const btn = win.document.getElementById("analyzeBtn");
  const resultEl = win.document.getElementById("result");

  console.log("\n[2] Form gating");
  fill({ sleep: 5, breaks: 2, screen: 12, pressure: 2, stress: 3, motivation: 3 });
  setField("motivation", ""); // clear one field again
  check("button disabled while incomplete", btn.disabled === true);
  setField("motivation", 1);
  check("button enabled when all 6 filled", btn.disabled === false);
  check("progress bar at 100%", win.document.getElementById("progressBar").style.width === "100%");

  console.log("\n[3] High-risk assessment renders ML result");
  fill({ sleep: 4, breaks: 2, screen: 14, pressure: 2, stress: 5, motivation: 1 });
  win.analyze();
  await sleep(1300); // analyze() has a 900ms UI delay

  check("result section visible", !resultEl.classList.contains("hidden"));
  const riskText = win.document.getElementById("riskLevel").innerText || "";
  check(`risk level is High with index (${JSON.stringify(riskText)})`, /Risk Level: High/.test(riskText) && /risk index \d+\/100/.test(riskText));
  const meter = win.document.getElementById("riskMeter");
  check("meter colored for high class", meter.className.includes("level-2"));
  check(`meter width animates (${meter.style.width})`, /^(\d{2,3}|100)%$/.test(meter.style.width) && parseInt(meter.style.width) >= 50);

  const meta = win.document.getElementById("mlMeta").innerText || "";
  check(`model meta line present (${JSON.stringify(meta)})`, /4-model ensemble/.test(meta) && /models agree/.test(meta));

  const drivers = [...win.document.querySelectorAll("#driverList li")];
  check(`driver list rendered (${drivers.length} items, 1–5)`, drivers.length >= 1 && drivers.length <= 5);
  check("driver has direction bar", !!drivers[0] && drivers[0].className.includes("driver") && !!drivers[0].querySelector(".driver-bar"));
  check("driver bar has width", !!drivers[0] && /%$/.test(drivers[0].querySelector(".driver-bar").style.width));

  const signals = [...win.document.querySelectorAll("#signalList li")];
  const actions = [...win.document.querySelectorAll("#actionsList li")];
  check(`rule signals still rendered (${signals.length})`, signals.length >= 1);
  check(`rule actions still rendered (${actions.length})`, actions.length >= 1);

  const conf = win.document.getElementById("confidence").innerText || "";
  check(`confidence cites ensemble accuracy (${JSON.stringify(conf)})`, /Assessment confidence: (High|Moderate|Low)/.test(conf) && /accuracy/.test(conf));

  const table = win.document.getElementById("modelTable");
  const rows = table.querySelectorAll("tbody tr");
  check(`model table has 6 rows (${rows.length})`, rows.length === 6);
  check("ensemble row shows ~79% accuracy", /79\.\d%/.test(table.textContent) || /8\d\.\d%/.test(table.textContent));
  check("rules baseline row shows ~62%", /62\.\d%/.test(table.textContent));
  const disclaimer = win.document.getElementById("modelDisclaimer").innerText || "";
  check("disclaimer states synthetic-data caveat", /not clinical validity|synthetic/i.test(disclaimer));

  console.log("\n[4] Downloadable report includes ML section");
  const created = [];
  win.URL.createObjectURL = (blob) => {
    created.push(blob);
    return "blob:mock";
  };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {};
  let reportOk = true;
  try {
    win.downloadReport();
  } catch (e) {
    reportOk = false;
    console.log("    downloadReport threw:", e.message);
  }
  check("downloadReport runs without error", reportOk);
  check("report blob created", created.length === 1);
  if (created.length === 1 && typeof created[0].text === "function") {
    const reportHtml = await created[0].text();
    check("report contains risk badge with index", /risk index \d+\/100/.test(reportHtml));
    check("report contains the driver section", /what drove the score/i.test(reportHtml));
    check("report contains ensemble meta", /4-model ensemble/.test(reportHtml));
  }

  console.log("\n[5] Healthy profile flips the prediction");
  fill({ sleep: 8, breaks: 0, screen: 4, pressure: 0, stress: 1, motivation: 5 });
  win.analyze();
  await sleep(1300);
  const riskText2 = win.document.getElementById("riskLevel").innerText || "";
  check(`risk level is Low (${JSON.stringify(riskText2)})`, /Risk Level: Low/.test(riskText2));
  check("meter colored for low class", win.document.getElementById("riskMeter").className.includes("level-0"));

  console.log("\n[6] No runtime errors accumulated");
  check("zero page errors overall", pageErrors.length === 0, pageErrors[0]);

  console.log(`\n${passed} passed, ${failed} failed`);
  dom.window.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

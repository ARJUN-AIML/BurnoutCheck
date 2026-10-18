/**
 * Verification suite for the BurnoutML pipeline.
 *
 *   node ml/test.js
 *
 * Checks artifact integrity, fresh-holdout accuracy vs. the reported
 * metrics, inference/probability invariants, input sanitization,
 * explanation quality, and direction sanity on real profiles.
 */
"use strict";

const path = require("path");
const engine = require("./engine");
const dataset = require("./dataset");

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

function approx(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
console.log("Loading model artifact...");
const modelPath = path.join(__dirname, "model.js");
const fs = require("fs");
const loadModel = new Function(fs.readFileSync(modelPath, "utf8") + "\nreturn BURNOUT_MODEL;");
const model = loadModel();

console.log("\n[1] Artifact integrity");
check("model has meta/classes/features", model && model.meta && model.meta.classes && model.meta.features);
check(
  "feature count matches engine builder",
  model.meta.features.length === engine.buildFeatures({ sleep: 7, breaks: 1, screen: 6, pressure: 1, stress: 3, motivation: 3 }).length,
  `artifact=${model.meta.features.length}`
);
check("standardization stats present", model.meta.standardize.mean.length === model.meta.features.length && model.meta.standardize.std.every((s) => s > 0));
check("all four models present", ["logistic", "mlp", "forest", "knn"].every((k) => model.models[k]));
check("ensemble weights sum to 1", approx(Object.values(model.weights).reduce((a, b) => a + b, 0), 1, 1e-6));
check("forest has >= 40 trees", model.models.forest.trees.length >= 40);
check("kNN support set present", model.models.knn.points.length >= 500 && model.models.knn.labels.length === model.models.knn.points.length);
check("reported test metrics present", model.metrics.test && model.metrics.test.ensemble.accuracy > 0.5 && model.metrics.test.bayesCeiling > 0.5);

console.log("\n[2] Fresh-holdout accuracy (new seeds, never seen in training)");
const holdout = dataset.generate(8000, 5150); // fresh seed
const rng = dataset.makeRng(777);
const holdoutLabels = holdout.map((r) => dataset.labelOf(r, model.meta.thresholds, rng));

let correct = 0,
  ruleCorrect = 0;
const cm = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0]
];
for (let i = 0; i < holdout.length; i++) {
  const pred = engine.predict(holdout[i], model);
  if (pred.classIndex === holdoutLabels[i]) correct++;
  cm[holdoutLabels[i]][pred.classIndex]++;
  if (dataset.legacyRules(holdout[i]) === model.meta.classes[holdoutLabels[i]]) ruleCorrect++;
}
const acc = correct / holdout.length;
const ruleAcc = ruleCorrect / holdout.length;
const reported = model.metrics.test.ensemble.accuracy;
const ceiling = model.metrics.test.bayesCeiling;

check(`holdout accuracy ${acc.toFixed(4)} within 2pp of reported ${reported.toFixed(4)}`, Math.abs(acc - reported) <= 0.02, `acc=${acc.toFixed(4)}`);
check(`holdout accuracy <= Bayes ceiling + 0.5pp (${ceiling.toFixed(4)})`, acc <= ceiling + 0.005, `acc=${acc.toFixed(4)}`);
check(`beats legacy rules by >= 8pp (rules ${ruleAcc.toFixed(4)})`, acc - ruleAcc >= 0.08, `delta=${(acc - ruleAcc).toFixed(4)}`);

// per-class recall — no class may be systematically abandoned
for (let c = 0; c < 3; c++) {
  const support = cm[c].reduce((a, b) => a + b, 0);
  const recall = cm[c][c] / support;
  check(`class "${model.meta.classes[c]}" recall >= 0.70 (${recall.toFixed(3)})`, recall >= 0.7);
}

console.log("\n[3] Inference invariants");
const sample = { sleep: 6.5, breaks: 1, screen: 8, pressure: 1, stress: 3, motivation: 3 };
const p1 = engine.predict(sample, model);
const p2 = engine.predict(sample, model);
check("probabilities sum to 1", approx(p1.probs.reduce((a, b) => a + b, 0), 1, 1e-9));
check("deterministic across calls", JSON.stringify(p1.probs) === JSON.stringify(p2.probs));
check("risk index in [0,1]", p1.riskIndex >= 0 && p1.riskIndex <= 1);
check("confidence score in [0,1]", p1.confidenceScore >= 0 && p1.confidenceScore <= 1);
check("agreement equals sum of weights of agreeing models", approx(p1.agreement, p1.modelVotes.reduce((s, v) => s + (v.agrees ? model.weights[v.model] : 0), 0), 1e-9));

// parity: ensemble probs must equal the weighted mix of sub-model outputs
const f = engine.buildFeatures(p1.input);
const z = engine.standardize(f, model.meta.standardize);
const mix = [0, 0, 0];
const w = model.weights;
const parts = [
  [w.logistic, engine.forwardLogistic(model.models.logistic, z)],
  [w.mlp, engine.forwardMLP(model.models.mlp, z)],
  [w.forest, engine.forwardForest(model.models.forest, f)],
  [w.knn, engine.forwardKNN(model.models.knn, z)]
];
for (const [wt, pr] of parts) for (let c = 0; c < 3; c++) mix[c] += wt * pr[c];
check(
  "ensemble = weighted mix of sub-models",
  mix.every((v, i) => approx(v, p1.probs[i], 1e-9)),
  `mix=${mix.map((v) => v.toFixed(6))} pred=${p1.probs.map((v) => v.toFixed(6))}`
);

console.log("\n[4] Input sanitization");
const dirty = engine.predict({ sleep: 99, breaks: 9, screen: -5, pressure: NaN, stress: 100, motivation: 0 }, model);
check("out-of-range inputs are clamped", dirty.input.sleep === 24 && dirty.input.screen === 0 && dirty.input.stress === 5 && dirty.input.motivation === 1);
check("NaN falls back to baseline", dirty.input.pressure === model.meta.baselines.pressure);
check("still yields valid probabilities", approx(dirty.probs.reduce((a, b) => a + b, 0), 1, 1e-9));

console.log("\n[5] Direction sanity on archetypal profiles");
const burnedOut = engine.predict({ sleep: 4, breaks: 2, screen: 14, pressure: 2, stress: 5, motivation: 1 }, model);
const thriving = engine.predict({ sleep: 8, breaks: 0, screen: 4, pressure: 0, stress: 1, motivation: 5 }, model);
const overdrive = engine.predict({ sleep: 5.5, breaks: 2, screen: 9, pressure: 2, stress: 5, motivation: 5 }, model);
check(`high-strain profile -> High (got ${burnedOut.label})`, burnedOut.label === "High");
check(`healthy profile -> Low (got ${thriving.label})`, thriving.label === "Low");
check("high-strain risk > healthy risk", burnedOut.riskIndex > thriving.riskIndex + 0.4, `${burnedOut.riskIndex.toFixed(3)} vs ${thriving.riskIndex.toFixed(3)}`);
check("overdrive profile not Low", overdrive.label !== "Low", overdrive.label);

// monotonicity: raising stress should not lower risk (average over samples)
let monoViolations = 0,
  monoTotal = 0;
const monoRng = dataset.makeRng(4242);
for (let i = 0; i < 300; i++) {
  const base = {
    sleep: 4 + monoRng.rand() * 6,
    breaks: Math.floor(monoRng.rand() * 3),
    screen: 2 + monoRng.rand() * 12,
    pressure: Math.floor(monoRng.rand() * 3),
    stress: 1 + Math.floor(monoRng.rand() * 4),
    motivation: 1 + Math.floor(monoRng.rand() * 5)
  };
  const a = engine.predict(base, model).riskIndex;
  const b = engine.predict({ ...base, stress: base.stress + 1 }, model).riskIndex;
  monoTotal++;
  if (b < a - 1e-9) monoViolations++;
}
check(`stress increases never reduce risk (${monoTotal - monoViolations}/${monoTotal})`, monoViolations / monoTotal < 0.02, `violations=${monoViolations}`);

console.log("\n[6] Explanations");
const exp = engine.explain({ sleep: 5, breaks: 2, screen: 12, pressure: 2, stress: 5, motivation: 2 }, model);
check("one contribution per raw feature", exp.contributions.length === engine.RAW_FEATURES.length);
check("contributions sorted by magnitude", exp.contributions.every((c, i, arr) => i === 0 || Math.abs(arr[i - 1].delta) >= Math.abs(c.delta)));
check("contributions finite", exp.contributions.every((c) => Number.isFinite(c.delta)));
const top = exp.contributions[0];
check("top driver for strained profile is stress/sleep/screen-related", ["stress", "sleep", "screen", "stateDelta", "demand", "strain", "sleepDeficit"].includes(top.feature), `top=${top.feature}`);

console.log("\n[7] Model confidence behaves sensibly");
const clearHigh = engine.predict({ sleep: 4, breaks: 2, screen: 13, pressure: 2, stress: 5, motivation: 1 }, model);
const borderline = engine.predict({ sleep: 7, breaks: 1, screen: 7, pressure: 1, stress: 3, motivation: 3 }, model);
check(`clear-cut case has high agreement (${clearHigh.votes}/4)`, clearHigh.votes === 4, `${clearHigh.votes}/4`);
check("borderline case scores lower or equal confidence", borderline.confidenceScore <= clearHigh.confidenceScore);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

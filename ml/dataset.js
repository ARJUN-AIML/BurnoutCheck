/**
 * Synthetic, research-informed student dataset generator.
 *
 * There is no openly licensed burnout dataset that carries all six inputs
 * of this app (sleep, breaks, screen time, pressure, stress, motivation),
 * so training data is generated from a structural model whose directions
 * and rough magnitudes follow the published literature:
 *
 *  - Perceived stress and academic pressure positively track exhaustion,
 *    cynicism and inefficacy (Allen et al. 2021, PMC7483179;
 *    Gao 2023, PMC10278958).
 *  - More sleep lowers exhaustion; poor sleep quality raises all three
 *    burnout dimensions (Allen et al. 2021). 7–9h is the young-adult
 *    recommendation (CDC/PCD 2022, 22_0060).
 *  - Low motivation/interest and low academic efficacy raise cynicism and
 *    inefficacy (Chong et al. 2025, PMC11852093).
 *  - Problematic technology use associates with burnout, though total
 *    daily screen hours is a weaker, suggestive predictor.
 *  - Break frequency has no validated threshold, so it is used with a
 *    small weight only.
 *
 * Labels follow the MBI-SS construct (exhaustion, cynicism, reduced
 * academic efficacy) rather than any single input: burnout is never
 * "assigned" from one variable. Class cut points come from the training
 * distribution (45% Low / 35% Medium / 20% High before label noise),
 * consistent with published student prevalence ranges of roughly
 * one-in-five to three-in-five.
 *
 * The dataset is synthetic: accuracy numbers describe agreement with this
 * labeling function, not clinical validity.
 */
"use strict";

/** Deterministic PRNG (mulberry32) so training runs are reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let spare = null;
  function randn() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0,
      v = 0,
      s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * m;
    return u * m;
  }
  return { rand, randn };
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function roundHalf(v) {
  return Math.round(v * 2) / 2;
}

function pickWeighted(rand, values, weights) {
  const r = rand();
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += weights[i];
    if (r <= acc) return values[i];
  }
  return values[values.length - 1];
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Standard deviation of the independent noise inside each latent
// MBI-SS-like component. Lower = cleaner labels (higher accuracy ceiling).
const COMPONENT_NOISE = { exhaustion: 0.75, cynicism: 0.75, inefficacy: 0.75 };

// Probability that an adjacent-class label flip is applied after thresholds.
const FLIP_PROB = 0.06;

// Posterior noise sd of the composite burnout index (for ceiling math)
const LABEL_NOISE_SD = Math.sqrt(
  Math.pow(0.4 * COMPONENT_NOISE.exhaustion, 2) +
    Math.pow(0.35 * COMPONENT_NOISE.cynicism, 2) +
    Math.pow(0.25 * COMPONENT_NOISE.inefficacy, 2)
);

/** P(observed label | true base class) — mirrors labelOf(). */
function flipMatrix() {
  const half = FLIP_PROB / 2;
  return [
    [1 - half, half, 0],
    [half, 1 - FLIP_PROB, half],
    [0, half, 1 - half]
  ];
}

/**
 * Draw one correlated student profile.
 * Returns the six raw inputs plus the latent burnout components.
 */
function sampleStudent(rng) {
  const { rand, randn } = rng;

  // Latent traits: conscientiousness (healthy habits) and drive
  const conscientious = randn();
  const drive = randn();

  const pressure = pickWeighted(rand, [0, 1, 2], [0.18, 0.47, 0.35]);

  // Perceived stress tracks pressure (structural, per Allen et al. 2021)
  const stressCont = 2.35 + 0.8 * pressure + 0.75 * randn();
  const stress = clamp(Math.round(stressCont), 1, 5);

  // Motivation falls with stress/pressure, rises with drive (low motivation
  // and low efficacy are burnout dimensions per MBI-SS)
  const motivationCont = 3.45 - 0.5 * (stressCont - 3) - 0.25 * pressure + 0.85 * drive + 0.5 * randn();
  const motivation = clamp(Math.round(motivationCont), 1, 5);

  // Sleep: pressured, stressed students sleep less; conscientious students
  // protect sleep (more sleep -> lower exhaustion, Allen et al. 2021)
  let sleep = 7.6 - 0.5 * pressure - 0.35 * (stressCont - 3) + 0.5 * conscientious + 0.65 * randn();
  sleep = clamp(roundHalf(sleep), 3, 11);

  // Screen time: workload and stress push it up, healthy habits pull it down
  let screen = 6.5 + 1.1 * pressure + 0.45 * (stressCont - 3) - 0.6 * conscientious + 1.8 * randn();
  screen = clamp(roundHalf(screen), 1, 16);

  // Break frequency: ordered logits driven by pressure/stress/screen
  const pRarely = sigmoid(-0.45 + 0.55 * pressure + 0.3 * (stressCont - 3) + 0.12 * screen - 0.5 * conscientious);
  const pSometimes = sigmoid(-0.2 - 0.35 * pressure + 0.35 * conscientious) * (1 - pRarely);
  const r = rand();
  const breaks = r < pRarely ? 2 : r < pRarely + pSometimes ? 1 : 0;

  // ---- Latent MBI-SS-like components (with independent noise) ----
  const sleepDeficit = Math.max(0, 7 - sleep);
  const sleepExcess = Math.max(0, sleep - 9.5);

  const exhaustion =
    0.85 * (stress - 1) +
    0.75 * pressure +
    0.5 * sleepDeficit +
    0.07 * screen +
    0.3 * breaks -
    1.15 +
    COMPONENT_NOISE.exhaustion * randn();

  const cynicism =
    0.45 * (stress - 1) +
    0.55 * pressure +
    0.55 * Math.max(0, 3.5 - motivation) +
    0.05 * screen -
    0.85 +
    COMPONENT_NOISE.cynicism * randn();

  const inefficacy =
    0.7 * Math.max(0, 4 - motivation) +
    0.3 * (stress - 1) +
    0.35 * sleepDeficit -
    0.95 +
    COMPONENT_NOISE.inefficacy * randn();

  // Overdrive: very high stress with very high motivation is unsustainable
  const overdrive = Math.max(0, stress - 3.5) * Math.max(0, motivation - 3.5) * 0.5;

  const index = 0.4 * exhaustion + 0.35 * cynicism + 0.25 * inefficacy + overdrive + 0.35 * sleepExcess;

  return {
    sleep,
    breaks,
    screen,
    pressure,
    stress,
    motivation,
    index
  };
}

/** Draw n students. */
function generate(n, seed) {
  const rng = makeRng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(sampleStudent(rng));
  return rows;
}

function quantile(sortedValues, q) {
  const pos = (sortedValues.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

/** Derive Low/Medium/High cut points from a training split. */
function fitThresholds(trainRows) {
  const sorted = trainRows.map((r) => r.index).sort((a, b) => a - b);
  return { low: quantile(sorted, 0.45), medium: quantile(sorted, 0.8) };
}

/** Apply thresholds (+ optional adjacent-class label noise). */
function labelOf(row, thresholds, rng) {
  let cls = row.index <= thresholds.low ? 0 : row.index <= thresholds.medium ? 1 : 2;
  if (rng) {
    const noise = rng.rand();
    if (noise < FLIP_PROB) {
      // flip to an adjacent class with equal probability
      const up = rng.rand() < 0.5;
      if (cls === 0 && up) cls = 1;
      else if (cls === 1) cls = up ? 2 : 0;
      else if (cls === 2 && !up) cls = 1;
    }
  }
  return cls;
}

/** Population median baselines (used for neutral-reference explanations). */
function computeBaselines(rows) {
  const med = (key, sorted) => quantile(sorted, 0.5);
  const keys = ["sleep", "breaks", "screen", "pressure", "stress", "motivation"];
  const out = {};
  keys.forEach((k) => {
    const sorted = rows.map((r) => r[k]).sort((a, b) => a - b);
    out[k] = Math.round(med(k, sorted) * 100) / 100;
  });
  return out;
}

/**
 * The legacy rule engine from app.js, ported for offline comparison.
 * MUST mirror app.js pattern blocks exactly: five else-if branches on
 * (stress, motivation) with a default of "Low" when no branch matches.
 * Returns "Low" | "Medium" | "High".
 */
function legacyRules(row) {
  const sleep = row.sleep,
    stress = row.stress,
    motivation = row.motivation;

  if (stress >= 4 && motivation <= 2) return "High";
  if (stress >= 4 && motivation >= 4) return sleep < 6 ? "High" : "Medium";
  if (stress <= 2 && motivation <= 2) return "Medium";
  if (stress <= 2 && motivation >= 4) return "Low";
  if (stress === 3) return motivation <= 2 ? "Medium" : "Low";
  return "Low";
}

module.exports = {
  makeRng,
  generate,
  fitThresholds,
  labelOf,
  computeBaselines,
  legacyRules,
  quantile,
  flipMatrix,
  FLIP_PROB,
  COMPONENT_NOISE,
  LABEL_NOISE_SD
};

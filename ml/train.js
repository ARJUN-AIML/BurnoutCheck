/**
 * Trains the BurnoutCheck ensemble and writes ml/model.js (browser artifact).
 *
 *   node ml/train.js
 *
 * Models: multinomial logistic regression, a 2-layer MLP, a random forest,
 * and k-NN. They are blended with validation-accuracy weights and evaluated
 * on a held-out test set against the legacy rule engine baseline.
 * No dependencies — plain Node.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const dataset = require("./dataset");
const engine = require("./engine");

const CLASSES = ["Low", "Medium", "High"];

// ---------------------------------------------------------------------------
// 1. Data
// ---------------------------------------------------------------------------
console.log("Generating dataset...");
const N_TRAIN = 16000,
  N_VAL = 4000,
  N_TEST = 6000;

const trainRaw = dataset.generate(N_TRAIN, 42);
const valRaw = dataset.generate(N_VAL, 7);
const testRaw = dataset.generate(N_TEST, 99);

const thresholds = dataset.fitThresholds(trainRaw);

function labelSplit(rows, rng) {
  return rows.map((r) => dataset.labelOf(r, thresholds, rng));
}

const yTrain = labelSplit(trainRaw, dataset.makeRng(1234));
const yVal = labelSplit(valRaw, dataset.makeRng(5678));
const yTest = labelSplit(testRaw, dataset.makeRng(9012));

const baselines = dataset.computeBaselines(trainRaw);

// ---------------------------------------------------------------------------
// 2. Feature matrices
// ---------------------------------------------------------------------------
console.log("Engineering features...");
const XTrainRaw = trainRaw.map((r) => engine.buildFeatures(r));
const XValRaw = valRaw.map((r) => engine.buildFeatures(r));
const XTestRaw = testRaw.map((r) => engine.buildFeatures(r));
const F = XTrainRaw[0].length;

const mean = new Array(F).fill(0),
  std = new Array(F).fill(0);
for (let f = 0; f < F; f++) {
  let s = 0;
  for (let i = 0; i < N_TRAIN; i++) s += XTrainRaw[i][f];
  mean[f] = s / N_TRAIN;
  let v = 0;
  for (let i = 0; i < N_TRAIN; i++) {
    const d = XTrainRaw[i][f] - mean[f];
    v += d * d;
  }
  std[f] = Math.sqrt(v / N_TRAIN) || 1;
}
const stdz = (rows) => rows.map((r) => engine.standardize(r, { mean, std }));
const ZTrain = stdz(XTrainRaw),
  ZVal = stdz(XValRaw),
  ZTest = stdz(XTestRaw);

// ---------------------------------------------------------------------------
// 3. Multinomial logistic regression (Adam, full batch)
// ---------------------------------------------------------------------------
console.log("Training logistic regression...");
function trainLogistic(Z, y, nClasses, opts) {
  const N = Z.length,
    Fdim = Z[0].length;
  const W = Array.from({ length: nClasses }, () => new Array(Fdim).fill(0));
  const b = new Array(nClasses).fill(0);

  // Adam state
  const mW = Array.from({ length: nClasses }, () => new Array(Fdim).fill(0)),
    vW = Array.from({ length: nClasses }, () => new Array(Fdim).fill(0)),
    mb = new Array(nClasses).fill(0),
    vb = new Array(nClasses).fill(0);

  const lr = 0.05,
    beta1 = 0.9,
    beta2 = 0.999,
    eps = 1e-8,
    l2 = 1e-4;
  let bestLoss = Infinity,
    bestState = null,
    stale = 0;

  for (let step = 1; step <= 500; step++) {
    const gW = Array.from({ length: nClasses }, () => new Array(Fdim).fill(0));
    const gb = new Array(nClasses).fill(0);
    let loss = 0;

    for (let i = 0; i < N; i++) {
      const zi = Z[i];
      const logits = new Array(nClasses);
      let maxL = -Infinity;
      for (let c = 0; c < nClasses; c++) {
        let acc = b[c];
        const row = W[c];
        for (let f = 0; f < Fdim; f++) acc += row[f] * zi[f];
        logits[c] = acc;
        if (acc > maxL) maxL = acc;
      }
      let sum = 0;
      for (let c = 0; c < nClasses; c++) {
        logits[c] = Math.exp(logits[c] - maxL);
        sum += logits[c];
      }
      const truth = y[i];
      loss -= Math.log((logits[truth] / sum) || 1e-12);
      for (let c = 0; c < nClasses; c++) {
        const diff = logits[c] / sum - (c === truth ? 1 : 0);
        gb[c] += diff;
        const gRow = gW[c];
        for (let f = 0; f < Fdim; f++) gRow[f] += diff * zi[f];
      }
    }

    loss /= N;
    let pen = 0;
    for (let c = 0; c < nClasses; c++) {
      for (let f = 0; f < Fdim; f++) pen += W[c][f] * W[c][f];
    }
    loss += (l2 / 2) * pen;

    // Adam update
    const bc1 = 1 - Math.pow(beta1, step),
      bc2 = 1 - Math.pow(beta2, step);
    for (let c = 0; c < nClasses; c++) {
      mb[c] = beta1 * mb[c] + (1 - beta1) * (gb[c] / N);
      vb[c] = beta2 * vb[c] + (1 - beta2) * Math.pow(gb[c] / N, 2);
      b[c] -= (lr * (mb[c] / bc1)) / (Math.sqrt(vb[c] / bc2) + eps);
      const row = W[c],
        mRow = mW[c],
        vRow = vW[c];
      for (let f = 0; f < Fdim; f++) {
        const g = gW[c][f] / N + l2 * row[f];
        mRow[f] = beta1 * mRow[f] + (1 - beta1) * g;
        vRow[f] = beta2 * vRow[f] + (1 - beta2) * g * g;
        row[f] -= (lr * (mRow[f] / bc1)) / (Math.sqrt(vRow[f] / bc2) + eps);
      }
    }

    if (loss < bestLoss - 1e-5) {
      bestLoss = loss;
      stale = 0;
      bestState = JSON.stringify({ W, b });
    } else if (++stale >= 50) {
      break;
    }
  }
  const restored = JSON.parse(bestState);
  return { W: restored.W, b: restored.b };
}

const logistic = trainLogistic(ZTrain, yTrain, 3);

// ---------------------------------------------------------------------------
// 4. MLP (mini-batch Adam)
// ---------------------------------------------------------------------------
console.log("Training MLP neural network...");
function trainMLP(Z, y, opts) {
  const N = Z.length,
    din = Z[0].length,
    h1 = opts.h1,
    h2 = opts.h2,
    dout = 3;
  const rng = dataset.makeRng(2024);

  const he = (fanIn) => Math.sqrt(2 / fanIn);
  const randMat = (rows, cols, scale) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => rng.randn() * scale));
  const W1 = randMat(h1, din, he(din)),
    b1 = new Array(h1).fill(0);
  const W2 = randMat(h2, h1, he(h1)),
    b2 = new Array(h2).fill(0);
  const W3 = randMat(dout, h2, he(h2)),
    b3 = new Array(dout).fill(0);

  const params = [
    { w: W1, b: b1, mW: randMat(h1, din, 0), vW: randMat(h1, din, 0), mb: new Array(h1).fill(0), vb: new Array(h1).fill(0) },
    { w: W2, b: b2, mW: randMat(h2, h1, 0), vW: randMat(h2, h1, 0), mb: new Array(h2).fill(0), vb: new Array(h2).fill(0) },
    { w: W3, b: b3, mW: randMat(dout, h2, 0), vW: randMat(dout, h2, 0), mb: new Array(dout).fill(0), vb: new Array(dout).fill(0) }
  ];

  const lr = 0.004,
    beta1 = 0.9,
    beta2 = 0.999,
    eps = 1e-8,
    wd = 1e-4,
    epochs = opts.epochs,
    batch = 256;
  const order = Array.from({ length: N }, (_, i) => i);
  let step = 0;
  let bestVal = Infinity,
    bestState = null,
    stale = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rng.rand() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }

    for (let start = 0; start < N; start += batch) {
      const end = Math.min(start + batch, N);
      const bs = end - start;
      step++;

      // gradients
      const g1 = Array.from({ length: h1 }, () => new Array(din).fill(0)),
        gb1 = new Array(h1).fill(0);
      const g2 = Array.from({ length: h2 }, () => new Array(h1).fill(0)),
        gb2 = new Array(h2).fill(0);
      const g3 = Array.from({ length: dout }, () => new Array(h2).fill(0)),
        gb3 = new Array(dout).fill(0);

      for (let s = start; s < end; s++) {
        const i0 = order[s];
        const z = Z[i0];

        // forward
        const a1 = new Array(h1);
        for (let i = 0; i < h1; i++) {
          let acc = b1[i];
          for (let j = 0; j < din; j++) acc += W1[i][j] * z[j];
          a1[i] = acc > 0 ? acc : 0;
        }
        const a2 = new Array(h2);
        for (let i = 0; i < h2; i++) {
          let acc = b2[i];
          for (let j = 0; j < h1; j++) acc += W2[i][j] * a1[j];
          a2[i] = acc > 0 ? acc : 0;
        }
        const logits = new Array(dout);
        let maxL = -Infinity;
        for (let i = 0; i < dout; i++) {
          let acc = b3[i];
          for (let j = 0; j < h2; j++) acc += W3[i][j] * a2[j];
          logits[i] = acc;
          if (acc > maxL) maxL = acc;
        }
        let sum = 0;
        for (let i = 0; i < dout; i++) {
          logits[i] = Math.exp(logits[i] - maxL);
          sum += logits[i];
        }
        const truth = y[i0];

        // backward
        const d3 = new Array(dout);
        for (let i = 0; i < dout; i++) d3[i] = logits[i] / sum - (i === truth ? 1 : 0);
        const d2 = new Array(h2).fill(0);
        for (let i = 0; i < dout; i++) {
          gb3[i] += d3[i];
          for (let j = 0; j < h2; j++) {
            g3[i][j] += d3[i] * a2[j];
            d2[j] += d3[i] * W3[i][j];
          }
        }
        const d1 = new Array(h1).fill(0);
        for (let i = 0; i < h2; i++) {
          if (a2[i] <= 0) continue;
          const dv = d2[i];
          gb2[i] += dv;
          for (let j = 0; j < h1; j++) {
            g2[i][j] += dv * a1[j];
            d1[j] += dv * W2[i][j];
          }
        }
        for (let i = 0; i < h1; i++) {
          if (a1[i] <= 0) continue;
          const dv = d1[i];
          gb1[i] += dv;
          for (let j = 0; j < din; j++) g1[i][j] += dv * z[j];
        }
      }

      // Adam step
      const bc1 = 1 - Math.pow(beta1, step),
        bc2 = 1 - Math.pow(beta2, step);
      const layers = [
        { p: params[0], g: g1, gb: gb1, rows: h1, cols: din },
        { p: params[1], g: g2, gb: gb2, rows: h2, cols: h1 },
        { p: params[2], g: g3, gb: gb3, rows: dout, cols: h2 }
      ];
      for (const L of layers) {
        for (let i = 0; i < L.rows; i++) {
          L.p.mb[i] = beta1 * L.p.mb[i] + (1 - beta1) * (L.gb[i] / bs);
          L.p.vb[i] = beta2 * L.p.vb[i] + (1 - beta2) * Math.pow(L.gb[i] / bs, 2);
          L.p.b[i] -= (lr * (L.p.mb[i] / bc1)) / (Math.sqrt(L.p.vb[i] / bc2) + eps);
          for (let j = 0; j < L.cols; j++) {
            const g = L.g[i][j] / bs + wd * L.p.w[i][j];
            L.p.mW[i][j] = beta1 * L.p.mW[i][j] + (1 - beta1) * g;
            L.p.vW[i][j] = beta2 * L.p.vW[i][j] + (1 - beta2) * g * g;
            L.p.w[i][j] -= (lr * (L.p.mW[i][j] / bc1)) / (Math.sqrt(L.p.vW[i][j] / bc2) + eps);
          }
        }
      }
    }

    if (opts.valZ && (epoch + 1) % 5 === 0) {
      const val = logLoss(opts.valZ, opts.valY, (z) => engine.forwardMLP({ W1, b1, W2, b2, W3, b3 }, z));
      if (val < bestVal - 1e-4) {
        bestVal = val;
        bestState = JSON.stringify({ W1, b1, W2, b2, W3, b3 });
        stale = 0;
      } else if (++stale >= 4) {
        break;
      }
    }
  }

  const final = bestState ? JSON.parse(bestState) : { W1, b1, W2, b2, W3, b3 };
  return final;
}

function logLoss(Z, y, fn) {
  let loss = 0;
  for (let i = 0; i < Z.length; i++) {
    const p = fn(Z[i]);
    loss -= Math.log(Math.max(p[y[i]], 1e-12));
  }
  return loss / Z.length;
}

const mlp = trainMLP(ZTrain, yTrain, { h1: 32, h2: 16, epochs: 90, valZ: ZVal, valY: yVal });

// ---------------------------------------------------------------------------
// 5. Random forest (CART, Gini, raw features)
// ---------------------------------------------------------------------------
console.log("Training random forest...");
const featureImportance = new Array(F).fill(0);

function gini(counts, n) {
  if (n === 0) return 0;
  let imp = 1;
  for (let c = 0; c < 3; c++) {
    const p = counts[c] / n;
    imp -= p * p;
  }
  return imp;
}

function buildTree(rows, labels, depth, rng, opts) {
  const n = rows.length;
  const counts = [0, 0, 0];
  for (let i = 0; i < n; i++) counts[labels[i]]++;

  if (depth >= opts.maxDepth || n < 2 * opts.minLeaf || counts[0] === n || counts[1] === n || counts[2] === n) {
    const smooth = counts.map((c) => (c + 1) / (n + 3));
    return { p: smooth };
  }

  // random feature subset
  const cand = [];
  for (let f = 0; f < F; f++) cand.push(f);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rng.rand() * (i + 1));
    const t = cand[i];
    cand[i] = cand[j];
    cand[j] = t;
  }
  const subset = cand.slice(0, opts.maxFeatures);

  const parentGini = gini(counts, n);
  let bestGain = 1e-7,
    bestF = -1,
    bestT = 0;

  for (const f of subset) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rows[a][f] - rows[b][f]);
    const lc = [0, 0, 0],
      rc = counts.slice();
    for (let i = 0; i < n - 1; i++) {
      const idx = order[i];
      lc[labels[idx]]++;
      rc[labels[idx]]--;
      const v1 = rows[idx][f];
      const v2 = rows[order[i + 1]][f];
      if (v1 === v2) continue;
      const nl = i + 1,
        nr = n - nl;
      if (nl < opts.minLeaf || nr < opts.minLeaf) continue;
      const gain = parentGini - (nl / n) * gini(lc, nl) - (nr / n) * gini(rc, nr);
      if (gain > bestGain) {
        bestGain = gain;
        bestF = f;
        bestT = (v1 + v2) / 2;
      }
    }
  }

  if (bestF === -1) {
    return { p: counts.map((c) => (c + 1) / (n + 3)) };
  }

  featureImportance[bestF] += bestGain * n;

  const leftRows = [],
    leftLabels = [],
    rightRows = [],
    rightLabels = [];
  for (let i = 0; i < n; i++) {
    if (rows[i][bestF] <= bestT) {
      leftRows.push(rows[i]);
      leftLabels.push(labels[i]);
    } else {
      rightRows.push(rows[i]);
      rightLabels.push(labels[i]);
    }
  }

  return {
    f: bestF,
    t: bestT,
    l: buildTree(leftRows, leftLabels, depth + 1, rng, opts),
    r: buildTree(rightRows, rightLabels, depth + 1, rng, opts)
  };
}

const forestRng = dataset.makeRng(777);
const forestOpts = { maxDepth: 6, minLeaf: 12, maxFeatures: Math.ceil(Math.sqrt(F)) };
const N_TREES = 60;
const trees = [];
for (let t = 0; t < N_TREES; t++) {
  const idx = Array.from({ length: N_TRAIN }, () => Math.floor(forestRng.rand() * N_TRAIN));
  const rows = idx.map((i) => XTrainRaw[i]);
  const labels = idx.map((i) => yTrain[i]);
  trees.push(buildTree(rows, labels, 0, forestRng, forestOpts));
  if ((t + 1) % 20 === 0) console.log(`  tree ${t + 1}/${N_TREES}`);
}
const forest = { trees };

// ---------------------------------------------------------------------------
// 6. k-NN support set (stratified, standardized)
// ---------------------------------------------------------------------------
console.log("Building kNN support set...");
const knnK = 25;
const perClass = [0, 0, 0];
const points = [],
  labels = [];
for (let i = 0; i < N_TRAIN && (perClass[0] < 200 || perClass[1] < 200 || perClass[2] < 200); i++) {
  const c = yTrain[i];
  if (perClass[c] < 200) {
    points.push(ZTrain[i]);
    labels.push(c);
    perClass[c]++;
  }
}
// shuffle deterministically
const kRng = dataset.makeRng(31);
for (let i = points.length - 1; i > 0; i--) {
  const j = Math.floor(kRng.rand() * (i + 1));
  [points[i], points[j]] = [points[j], points[i]];
  [labels[i], labels[j]] = [labels[j], labels[i]];
}
const knn = { k: knnK, points, labels };

// ---------------------------------------------------------------------------
// 7. Evaluate each model + fit ensemble weights on validation
// ---------------------------------------------------------------------------
function probsFor(name, Xraw, Z) {
  if (name === "logistic") return Xraw === null ? null : Z.map((z) => engine.forwardLogistic(logistic, z));
  if (name === "mlp") return Z.map((z) => engine.forwardMLP(mlp, z));
  if (name === "forest") return Xraw.map((x) => engine.forwardForest(forest, x));
  if (name === "knn") return Z.map((z) => engine.forwardKNN(knn, z));
}

const MODEL_NAMES = ["logistic", "mlp", "forest", "knn"];

function argmax3(p) {
  return p[0] >= p[1] && p[0] >= p[2] ? 0 : p[1] >= p[2] ? 1 : 2;
}

function metricsFor(yTrue, probRows) {
  const N = yTrue.length;
  const cm = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  let correct = 0,
    ll = 0;
  for (let i = 0; i < N; i++) {
    const p = probRows[i];
    const pred = argmax3(p);
    cm[yTrue[i]][pred]++;
    if (pred === yTrue[i]) correct++;
    ll -= Math.log(Math.max(p[yTrue[i]], 1e-12));
  }
  const perClass = [];
  let fsum = 0;
  for (let c = 0; c < 3; c++) {
    const tp = cm[c][c];
    let fp = 0,
      fn = 0;
    for (let k = 0; k < 3; k++) {
      if (k !== c) {
        fp += cm[k][c];
        fn += cm[c][k];
      }
    }
    const prec = tp + fp === 0 ? 0 : tp / (tp + fp);
    const rec = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = prec + rec === 0 ? 0 : (2 * prec * rec) / (prec + rec);
    perClass.push({ precision: prec, recall: rec, f1, support: tp + fn });
    fsum += f1;
  }
  return { accuracy: correct / N, macroF1: fsum / 3, logLoss: ll / N, confusion: cm, perClass };
}

console.log("Scoring models on validation...");
const valProbs = {};
for (const name of MODEL_NAMES) valProbs[name] = probsFor(name, XValRaw, ZVal);

const valMetrics = {};
for (const name of MODEL_NAMES) {
  valMetrics[name] = metricsFor(yVal, valProbs[name]);
  console.log(`  ${name.padEnd(9)} val acc=${valMetrics[name].accuracy.toFixed(4)} macroF1=${valMetrics[name].macroF1.toFixed(4)}`);
}

// Fit ensemble weights on validation data: random search over the weight
// simplex plus local refinement, maximizing accuracy (log-loss breaks ties).
function evalWeights(w, probRows, y) {
  let correct = 0,
    ll = 0;
  for (let i = 0; i < y.length; i++) {
    const p = [0, 0, 0];
    for (const n of MODEL_NAMES) {
      const pr = probRows[n][i];
      p[0] += w[n] * pr[0];
      p[1] += w[n] * pr[1];
      p[2] += w[n] * pr[2];
    }
    const pred = p[0] >= p[1] && p[0] >= p[2] ? 0 : p[1] >= p[2] ? 1 : 2;
    if (pred === y[i]) correct++;
    ll -= Math.log(Math.max(p[y[i]], 1e-12));
  }
  return { acc: correct / y.length, ll: ll / y.length };
}

const searchRng = dataset.makeRng(2468);
let bestWeights = null;

function considerWeights(w) {
  const r = evalWeights(w, valProbs, yVal);
  const score = r.acc * 1e6 - r.ll;
  if (!bestWeights || score > bestWeights.score) bestWeights = { w, score, ...r };
}

function randomWeights() {
  const raw = MODEL_NAMES.map(() => 0.02 + searchRng.rand());
  const s = raw.reduce((a, b) => a + b, 0);
  const w = {};
  MODEL_NAMES.forEach((n, i) => (w[n] = raw[i] / s));
  return w;
}

for (let i = 0; i < 3000; i++) considerWeights(randomWeights());
for (let round = 0; round < 3; round++) {
  for (let i = 0; i < 500; i++) {
    const w = {};
    let s = 0;
    for (const n of MODEL_NAMES) {
      w[n] = Math.max(0.01, bestWeights.w[n] + (searchRng.rand() - 0.5) * 0.08);
      s += w[n];
    }
    for (const n of MODEL_NAMES) w[n] /= s;
    considerWeights(w);
  }
}

const weights = bestWeights.w;
console.log(
  `  weight search: val acc=${bestWeights.acc.toFixed(4)} logloss=${bestWeights.ll.toFixed(4)}`
);

// ---------------------------------------------------------------------------
// 8. Test-set evaluation: each model, ensemble, legacy rules
// ---------------------------------------------------------------------------
console.log("Evaluating on held-out test set...");
const testProbs = {};
for (const name of MODEL_NAMES) testProbs[name] = probsFor(name, XTestRaw, ZTest);

const testMetrics = {};
for (const name of MODEL_NAMES) testMetrics[name] = metricsFor(yTest, testProbs[name]);

const ensembleProbs = testRaw.map((_, i) => {
  const acc = [0, 0, 0];
  for (const name of MODEL_NAMES) {
    const p = testProbs[name][i];
    acc[0] += weights[name] * p[0];
    acc[1] += weights[name] * p[1];
    acc[2] += weights[name] * p[2];
  }
  return acc;
});
const ensembleMetrics = metricsFor(yTest, ensembleProbs);

const legacyPred = testRaw.map((r) => CLASSES.indexOf(dataset.legacyRules(r)));
const legacyMetrics = metricsFor(
  yTest,
  legacyPred.map((c) => [c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0])
);
legacyMetrics.logLoss = null; // hard rules give no probabilities

// Theoretical Bayes ceiling: the best accuracy any classifier can reach on
// this label process given the exact six inputs (integrates over latent
// component noise and the adjacent-class label flips).
function erfApprox(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erfApprox(z / Math.SQRT2));

function bayesCeiling(rows) {
  const sd = dataset.LABEL_NOISE_SD;
  const M = dataset.flipMatrix();
  let sum = 0;
  for (const r of rows) {
    const p0 = Phi((thresholds.low - r.index) / sd);
    const p1 = Phi((thresholds.medium - r.index) / sd) - p0;
    const p2 = 1 - p0 - p1;
    let best = 0;
    for (let l = 0; l < 3; l++) {
      const o = p0 * M[0][l] + p1 * M[1][l] + p2 * M[2][l];
      if (o > best) best = o;
    }
    sum += best;
  }
  return sum / rows.length;
}

const ceiling = bayesCeiling(testRaw);

// ---------------------------------------------------------------------------
// 9. Global feature importance (normalized forest gain)
// ---------------------------------------------------------------------------
const impSum = featureImportance.reduce((a, b) => a + b, 0) || 1;
const globalImportance = {};
// FEATURE_LABELS keys are in buildFeatures order
const featNames = Object.keys(engine.FEATURE_LABELS);
featNames.forEach((key, i) => {
  globalImportance[key] = Math.round((featureImportance[i] / impSum) * 1e4) / 1e4;
});

// ---------------------------------------------------------------------------
// 10. Assemble + serialize
// ---------------------------------------------------------------------------
function roundDeep(v) {
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v;
    return Math.round(v * 1e6) / 1e6;
  }
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = roundDeep(v[k]);
    return out;
  }
  return v;
}

const prevalence = [0, 1, 2].map((c) => yTest.filter((y) => y === c).length / yTest.length);

const model = {
  meta: {
    version: 1,
    trainedAt: new Date().toISOString(),
    classes: CLASSES,
    features: featNames,
    nTrain: N_TRAIN,
    nVal: N_VAL,
    nTest: N_TEST,
    thresholds: thresholds,
    baselines: baselines,
    standardize: { mean, std },
    prevalence: prevalence,
    note: "Synthetic training data generated from a research-informed labeling function; accuracy measures agreement with that function, not clinical validity."
  },
  weights,
  metrics: {
    test: {
      ensemble: ensembleMetrics,
      legacyRules: legacyMetrics,
      bayesCeiling: ceiling,
      models: testMetrics
    },
    val: valMetrics
  },
  importance: globalImportance,
  models: { logistic, mlp, forest, knn }
};

const rounded = roundDeep(model);

// Renormalize weights after rounding so the serialized ensemble sums to 1
const wKeys = Object.keys(rounded.weights);
const wSum = wKeys.reduce((s, k) => s + rounded.weights[k], 0);
wKeys.forEach((k) => (rounded.weights[k] = rounded.weights[k] / wSum));

const banner = `/**
 * BurnoutCheck ML model artifact — GENERATED FILE, do not edit by hand.
 * Regenerate with:  node ml/train.js
 *
 * Ensemble test accuracy : ${(ensembleMetrics.accuracy * 100).toFixed(1)}%
 * Legacy rules baseline  : ${(legacyMetrics.accuracy * 100).toFixed(1)}%
 * Theoretical ceiling    : ${(ceiling * 100).toFixed(1)}% (Bayes-optimal for this label noise)
 * Macro F1 (ensemble)    : ${ensembleMetrics.macroF1.toFixed(3)}
 * Trained                : ${model.meta.trainedAt}
 */
var BURNOUT_MODEL = `;

const outPath = path.join(__dirname, "model.js");
fs.writeFileSync(outPath, banner + JSON.stringify(rounded) + ";\n");

console.log("\n=== Test set results ===");
for (const name of MODEL_NAMES) {
  const m = testMetrics[name];
  console.log(`  ${name.padEnd(9)} acc=${m.accuracy.toFixed(4)}  macroF1=${m.macroF1.toFixed(4)}  logloss=${m.logLoss.toFixed(4)}`);
}
console.log(`  ${"ENSEMBLE".padEnd(9)} acc=${ensembleMetrics.accuracy.toFixed(4)}  macroF1=${ensembleMetrics.macroF1.toFixed(4)}  logloss=${ensembleMetrics.logLoss.toFixed(4)}`);
console.log(`  ${"legacy".padEnd(9)} acc=${legacyMetrics.accuracy.toFixed(4)}  macroF1=${legacyMetrics.macroF1.toFixed(4)}`);
console.log(`  Bayes ceiling for this label process: ${ceiling.toFixed(4)} (ensemble reaches ${((ensembleMetrics.accuracy / ceiling) * 100).toFixed(1)}% of it)`);
console.log("\nEnsemble confusion matrix [rows=true Low/Med/High, cols=pred]:");
console.log(ensembleMetrics.confusion.map((r) => "  " + r.join("\t")).join("\n"));
console.log("\nWeights:", weights);
console.log("\nWrote", outPath, `(${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);

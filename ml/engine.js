/**
 * BurnoutML engine — feature engineering + ensemble inference.
 *
 * Runs both in the browser (window.BurnoutML) and in Node (module.exports)
 * so training, tests and the live app share one implementation.
 *
 * The ensemble is composed of four models trained by ml/train.js:
 *   1. multinomial logistic regression (linear, calibrated baseline)
 *   2. a small MLP neural network (nonlinear interactions)
 *   3. a random forest (captures threshold/interaction effects)
 *   4. k-nearest neighbours (local, instance-based signal)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BurnoutML = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CLASSES = ["Low", "Medium", "High"];

  var RAW_FEATURES = ["sleep", "breaks", "screen", "pressure", "stress", "motivation"];

  // Human-friendly labels for engineered features (order matches buildFeatures)
  var FEATURE_LABELS = {
    sleep: "Sleep duration",
    sleepDeficit: "Sleep deficit (<7.5h)",
    oversleep: "Oversleeping (>9h)",
    screen: "Screen time",
    screenSleepLoad: "Screen time eating into sleep",
    breaks: "Infrequent breaks",
    pressure: "Study/work pressure",
    pressureNoBreaks: "Pressure without breaks",
    stress: "Stress",
    motivation: "Motivation",
    stateDelta: "Stress outweighing motivation",
    stressMotivation: "Stress × motivation (overdrive)",
    demand: "Total perceived demand",
    recovery: "Recovery capacity",
    strain: "Overall strain",
    sleepInWindow: "Sleep in the 7–9h window",
    screenModerate: "Moderate screen time",
    sustainedLoad: "Sustained load vs recovery"
  };

  var FEEDBACK = {
    sleepDeficit: "increase sleep",
    oversleep: "keep a consistent wake time",
    screen: "reduce screen time",
    screenSleepLoad: "cut evening screen use",
    breaks: "take more short breaks",
    pressureNoBreaks: "schedule breaks around deadlines",
    stress: "lower perceived stress",
    stateDelta: "protect motivation while stress is high",
    demand: "reduce total demand",
    strain: "lower overall strain",
    sustainedLoad: "balance load with recovery"
  };

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function toFinite(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Defensive copy of raw user inputs with hard clamps. */
  function sanitize(raw, baselines) {
    var b = baselines || { sleep: 7, breaks: 1, screen: 6, pressure: 1, stress: 3, motivation: 3 };
    return {
      sleep: clamp(toFinite(raw.sleep, b.sleep), 0, 24),
      breaks: clamp(Math.round(toFinite(raw.breaks, b.breaks)), 0, 2),
      screen: clamp(toFinite(raw.screen, b.screen), 0, 24),
      pressure: clamp(Math.round(toFinite(raw.pressure, b.pressure)), 0, 2),
      stress: clamp(Math.round(toFinite(raw.stress, b.stress)), 1, 5),
      motivation: clamp(Math.round(toFinite(raw.motivation, b.motivation)), 1, 5)
    };
  }

  /**
   * Engineer 18 features from the 6 raw inputs.
   * MUST stay identical between training (ml/train.js) and inference.
   */
  function buildFeatures(i) {
    var sleep = i.sleep,
      screen = i.screen,
      breaks = i.breaks,
      pressure = i.pressure,
      stress = i.stress,
      motivation = i.motivation;

    var sleepDeficit = Math.max(0, 7.5 - sleep);
    var oversleep = Math.max(0, sleep - 9);
    var stateDelta = stress - motivation;
    var demand = stress * 0.5 + pressure * 0.75 + screen * 0.15;
    var recovery = Math.min(sleep, 9) / 9 + (2 - breaks) / 2;
    var strain = stress + pressure + screen / 4 - sleep / 2;

    return [
      sleep,
      sleepDeficit,
      oversleep,
      screen,
      screen * sleepDeficit,
      breaks,
      pressure,
      pressure * breaks,
      stress,
      motivation,
      stateDelta,
      stress * motivation,
      demand,
      recovery,
      strain,
      sleep >= 7 && sleep <= 9 ? 1 : 0,
      screen <= 8 ? 1 : 0,
      demand * (2 - recovery)
    ];
  }

  function standardize(f, meta) {
    var out = new Array(f.length);
    for (var k = 0; k < f.length; k++) {
      out[k] = (f[k] - meta.mean[k]) / meta.std[k];
    }
    return out;
  }

  function softmax(logits) {
    var max = Math.max(logits[0], logits[1], logits[2]);
    var e0 = Math.exp(logits[0] - max),
      e1 = Math.exp(logits[1] - max),
      e2 = Math.exp(logits[2] - max);
    var s = e0 + e1 + e2;
    return [e0 / s, e1 / s, e2 / s];
  }

  /** Multinomial logistic regression: softmax(W·z + b) */
  function forwardLogistic(model, z) {
    var W = model.W,
      b = model.b,
      logits = [b[0], b[1], b[2]];
    for (var c = 0; c < 3; c++) {
      var row = W[c],
        acc = b[c];
      for (var k = 0; k < row.length; k++) acc += row[k] * z[k];
      logits[c] = acc;
    }
    return softmax(logits);
  }

  /** Two-hidden-layer MLP with ReLU activations. */
  function forwardMLP(model, z) {
    var h1 = new Array(model.b1.length);
    var i, j, acc;
    for (i = 0; i < model.b1.length; i++) {
      acc = model.b1[i];
      for (j = 0; j < z.length; j++) acc += model.W1[i][j] * z[j];
      h1[i] = acc > 0 ? acc : 0;
    }
    var h2 = new Array(model.b2.length);
    for (i = 0; i < model.b2.length; i++) {
      acc = model.b2[i];
      for (j = 0; j < h1.length; j++) acc += model.W2[i][j] * h1[j];
      h2[i] = acc > 0 ? acc : 0;
    }
    var logits = new Array(model.b3.length);
    for (i = 0; i < model.b3.length; i++) {
      acc = model.b3[i];
      for (j = 0; j < h2.length; j++) acc += model.W3[i][j] * h2[j];
      logits[i] = acc;
    }
    return softmax(logits);
  }

  /** Walk one decision tree (raw, unstandardized features). */
  function walkTree(node, f) {
    while (node.p === undefined) {
      node = f[node.f] <= node.t ? node.l : node.r;
    }
    return node.p;
  }

  function forwardForest(model, f) {
    var acc = [0, 0, 0];
    var trees = model.trees;
    for (var t = 0; t < trees.length; t++) {
      var p = walkTree(trees[t], f);
      acc[0] += p[0];
      acc[1] += p[1];
      acc[2] += p[2];
    }
    acc[0] /= trees.length;
    acc[1] /= trees.length;
    acc[2] /= trees.length;
    // Serialized leaf probabilities are rounded — renormalize so each
    // tree contributes a proper distribution
    var s = acc[0] + acc[1] + acc[2];
    acc[0] /= s;
    acc[1] /= s;
    acc[2] /= s;
    return acc;
  }

  /** Inverse-distance weighted kNN over a stored support set. */
  function forwardKNN(model, z) {
    var pts = model.points,
      labels = model.labels,
      k = model.k,
      n = pts.length;
    var d = new Array(n);
    var idx = new Array(n);
    for (var i = 0; i < n; i++) {
      var p = pts[i],
        sum = 0;
      for (var j = 0; j < p.length; j++) {
        var diff = p[j] - z[j];
        sum += diff * diff;
      }
      d[i] = sum;
      idx[i] = i;
    }
    // partial selection of k smallest
    idx.sort(function (a, b) {
      return d[a] - d[b];
    });
    var probs = [0, 0, 0],
      wsum = 0;
    for (var m = 0; m < k; m++) {
      var dist = Math.sqrt(d[idx[m]]);
      var w = 1 / (dist + 0.05);
      probs[labels[idx[m]]] += w;
      wsum += w;
    }
    probs[0] /= wsum;
    probs[1] /= wsum;
    probs[2] /= wsum;
    return probs;
  }

  function mixProbs(parts, weights) {
    var out = [0, 0, 0];
    for (var m = 0; m < parts.length; m++) {
      out[0] += weights[m] * parts[m][0];
      out[1] += weights[m] * parts[m][1];
      out[2] += weights[m] * parts[m][2];
    }
    return out;
  }

  function riskIndexOf(probs) {
    return 0.5 * probs[1] + probs[2];
  }

  function argmax3(p) {
    return p[0] >= p[1] && p[0] >= p[2] ? 0 : p[1] >= p[2] ? 1 : 2;
  }

  function evaluate(raw, model) {
    var input = sanitize(raw, model.meta.baselines);
    var f = buildFeatures(input);
    var z = standardize(f, model.meta.standardize);

    var parts = [
      forwardLogistic(model.models.logistic, z),
      forwardMLP(model.models.mlp, z),
      forwardForest(model.models.forest, f),
      forwardKNN(model.models.knn, z)
    ];
    var w = model.weights;
    // Defensive normalization: artifact rounding must never break Σp = 1
    var wSum = w.logistic + w.mlp + w.forest + w.knn;
    var wn = {
      logistic: w.logistic / wSum,
      mlp: w.mlp / wSum,
      forest: w.forest / wSum,
      knn: w.knn / wSum
    };
    var probs = mixProbs(parts, [wn.logistic, wn.mlp, wn.forest, wn.knn]);
    // Final guarantee: exactly one distribution out
    var pSum = probs[0] + probs[1] + probs[2];
    probs[0] /= pSum;
    probs[1] /= pSum;
    probs[2] /= pSum;

    var classIndex = argmax3(probs);

    // Agreement: how many individual models vote for the predicted class.
    // Confidence uses the *weight-aware* agreement so a weak model's
    // disagreement dents confidence proportionally to its ensemble weight.
    var votes = 0;
    var weightedAgreement = 0;
    var modelVotes = [];
    var names = ["logistic", "mlp", "forest", "knn"];
    for (var m = 0; m < parts.length; m++) {
      var v = argmax3(parts[m]) === classIndex;
      if (v) votes++;
      if (v) weightedAgreement += wn[names[m]];
      modelVotes.push({ model: names[m], classIndex: argmax3(parts[m]), agrees: v, probs: parts[m] });
    }

    // Confidence blends: class probability, weight-aware agreement, entropy
    var maxP = probs[classIndex];
    var agreement = weightedAgreement;
    var entropy = 0;
    for (var c = 0; c < 3; c++) if (probs[c] > 0) entropy -= probs[c] * Math.log(probs[c]);
    var normEntropy = entropy / Math.log(3); // 0..1
    var confidenceScore = 0.5 * maxP + 0.3 * agreement + 0.2 * (1 - normEntropy);

    return {
      input: input,
      features: f,
      probs: probs,
      riskIndex: riskIndexOf(probs),
      classIndex: classIndex,
      label: CLASSES[classIndex],
      votes: votes,
      agreement: weightedAgreement,
      modelVotes: modelVotes,
      confidenceScore: confidenceScore,
      confidence: confidenceScore >= 0.68 ? "High" : confidenceScore >= 0.52 ? "Moderate" : "Low"
    };
  }

  /**
   * Local explanation via occlusion: how much each raw input pushes the
   * risk index away from a neutral (population median) baseline.
   */
  function explain(raw, model) {
    var base = evaluate(raw, model);
    var baselines = model.meta.baselines;
    var contributions = [];

    for (var i = 0; i < RAW_FEATURES.length; i++) {
      var key = RAW_FEATURES[i];
      var modified = {};
      for (var k = 0; k < RAW_FEATURES.length; k++) modified[RAW_FEATURES[k]] = base.input[RAW_FEATURES[k]];
      modified[key] = baselines[key];
      var delta = base.riskIndex - evaluate(modified, model).riskIndex;
      contributions.push({
        feature: key,
        label: FEATURE_LABELS[key] || key,
        delta: delta
      });
    }

    contributions.sort(function (a, b) {
      return Math.abs(b.delta) - Math.abs(a.delta);
    });
    return { prediction: base, contributions: contributions };
  }

  function predict(raw, model) {
    return evaluate(raw, model);
  }

  return {
    CLASSES: CLASSES,
    RAW_FEATURES: RAW_FEATURES,
    FEATURE_LABELS: FEATURE_LABELS,
    FEEDBACK: FEEDBACK,
    clamp: clamp,
    sanitize: sanitize,
    buildFeatures: buildFeatures,
    standardize: standardize,
    softmax: softmax,
    forwardLogistic: forwardLogistic,
    forwardMLP: forwardMLP,
    forwardForest: forwardForest,
    forwardKNN: forwardKNN,
    riskIndexOf: riskIndexOf,
    argmax3: argmax3,
    evaluate: evaluate,
    predict: predict,
    explain: explain
  };
});

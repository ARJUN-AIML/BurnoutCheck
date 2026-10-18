# BurnoutCheck

**Live app:** https://site-4cb9a72edd6a456b873d5b847b142769.freebuff.page

BurnoutCheck is a simple frontend web app I built to help students reflect on early signs of burnout based on everyday habits.

It’s not a diagnostic tool.  
The intention is awareness — noticing small patterns before they turn into bigger problems.

---

## Why I Built This

As students, it’s easy to normalize poor sleep, long screen time, and constant academic pressure.  
Burnout usually doesn’t happen all at once — it builds up slowly.

I built BurnoutCheck during a focused one-day sprint to practice frontend development and explore how design and logic can encourage self-reflection instead of judgment.

The logic and thresholds are intentionally simple and based on my own student experience.

---

## What the App Does

The app looks at a few daily factors and groups them into three areas:

### Recovery
- Sleep duration
- Breaks during the day

### Load
- Screen time
- Academic pressure

### State
- Stress level
- Motivation level

Based on these inputs, the app highlights possible burnout-related patterns and shows:
- An overall burnout risk level (Low / Medium / High) with a 0–100 risk index
- Which inputs are driving your score up or down
- The patterns that influenced the result
- Small, practical suggestions that might help

The risk level itself is predicted by a small machine-learning ensemble (see below).
The patterns and suggestions come from a rule-based explainer.

There is no scoring system and no data is stored.

---

## Design Approach

- Clean and minimal UI
- Subtle animations for better flow
- Calm colors to avoid visual stress
- Focus on clarity rather than complexity

The app is meant to feel like a quick self-check, not a test.

---

## Machine Learning

The risk prediction runs an ensemble of four models, all implemented in plain
JavaScript and executed entirely in the browser — no backend, no data leaves
the page:

1. **Multinomial logistic regression** — linear, calibrated baseline
2. **MLP neural network** (18 → 32 → 16 → 3, ReLU) — nonlinear interactions
3. **Random forest** (60 CART trees, depth 6) — threshold and interaction effects
4. **k-nearest neighbours** (k = 25, stratified support set) — local instance signal

The six raw inputs are expanded into 18 engineered features (sleep deficit,
oversleep, stress×motivation overdrive, strain, load-vs-recovery, etc.).
The four probability outputs are blended with weights fitted on a validation
split. The UI also reports model agreement and an occlusion-based
"what's driving your score" explanation.

### Measured performance

Held-out test set (6,000 samples, never seen during training or weight fitting):

| Model | Accuracy | Macro F1 |
|---|---|---|
| **Ensemble (4 models)** | **79.4%** | **0.784** |
| MLP neural network | 79.2% | 0.782 |
| Random forest | 78.8% | 0.778 |
| Logistic regression | 78.8% | 0.779 |
| k-NN (k=25) | 72.4% | 0.715 |
| Previous rule-based logic | 62.2% | 0.588 |

The theoretical (Bayes-optimal) ceiling for this label noise is **79.6%** —
the ensemble reaches 99.7% of it, so there is essentially no accuracy left
to gain by swapping models.

### Honest limitations

There is no openly licensed dataset that carries all six inputs of this app,
so training data is generated from a **research-informed synthetic labeling
function**: an MBI-SS-style latent construct (exhaustion, cynicism, reduced
efficacy) driven by stress, academic pressure, sleep, screen time, breaks and
motivation, with directions and rough magnitudes drawn from published studies
(citations in `ml/dataset.js`). Accuracy therefore measures agreement with
that labeling function — **not clinical validity**. BurnoutCheck remains an
awareness tool, not a diagnostic one.

---

## Tech Stack

- HTML
- CSS
- JavaScript (no frameworks)
- Custom ML engine (`ml/`) — trains in Node with zero dependencies, runs in the browser

This project is completely frontend-only and does not use any frameworks or
backend services. The model artifact is trained offline and shipped as static
JS (`ml/model.js`).

---

## Features

- Single-page web app
- ML risk prediction (4-model ensemble) with 0–100 risk index and animated meter
- "What's driving your score" contribution bars
- Model transparency panel: per-model accuracy, F1, and data caveats
- Signal-based burnout awareness
- Smooth animations and transitions
- Dark mode with animated toggle
- Progress indicator while filling inputs
- Downloadable text summary (including ML prediction details)
- No login, no tracking, no data collection — inference runs locally

---

## Important Note

BurnoutCheck is intended only for self-reflection and awareness.  
It does not provide medical advice or replace professional mental health support.

If someone is experiencing prolonged stress or emotional difficulty, seeking professional help is strongly recommended.

---

## Author

Built by **Arjun S**

---

## Development

```bash
node ml/train.js     # retrain the ensemble, regenerate ml/model.js (~20s)
node ml/test.js      # 34 checks: accuracy on a fresh holdout, invariants, sanity
npm install jsdom    # dev-only, not needed by the app
node ml/dom-test.js  # 31 checks: real page in jsdom, end-to-end UI flow
```

`ml/model.js` is a generated artifact — edit the training code, not the model.
Everything runs offline; opening `index.html` directly also works.

---

## Possible Improvements

- Calibrate against a real MBI-SS survey sample instead of synthetic labels
- Add sleep quality and screen-time-before-bed inputs (stronger predictors)
- Accessibility enhancements
- More mobile-specific refinements
- Additional educational resources about burnout

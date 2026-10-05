"""Outcome Predictor: logistic regression fitted at start-up on synthetic,
rubric-labelled interview profiles. Deterministic (fixed seed) so results are
reproducible across restarts and match the documented behaviour."""
from dataclasses import dataclass

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

FEATURES = ["overall", "coverage", "confidence", "star", "fillers", "timing", "credibility"]
LABELS = {
    "overall": "Overall answer quality",
    "coverage": "Key concepts covered",
    "confidence": "Confident delivery",
    "star": "Structured stories",
    "fillers": "Filler words",
    "timing": "Response timing",
    "credibility": "Resume credibility",
}
BASELINE = {"overall": 6.5, "coverage": 0.6, "confidence": 6.0, "star": 60.0, "fillers": 3.0, "timing": 75.0, "credibility": 60.0}
DISCLAIMER = "An estimate from practice performance — not a guarantee of any real hiring decision."


def synthetic_dataset(n: int = 5000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    skill = rng.normal(0, 1, n)  # latent candidate quality
    overall = np.clip(6 + 1.6 * skill + rng.normal(0, 0.9, n), 0, 10)
    coverage = np.clip(0.55 + 0.17 * skill + rng.normal(0, 0.12, n), 0, 1)
    confidence = np.clip(6 + 1.2 * skill + rng.normal(0, 1.3, n), 0, 10)
    star = np.clip(55 + 15 * skill + rng.normal(0, 14, n), 0, 100)
    fillers = np.clip(3.5 - 1.1 * skill + rng.normal(0, 1.4, n), 0, 20)
    timing = np.clip(75 + 8 * skill + rng.normal(0, 12, n), 0, 100)
    credibility = np.clip(60 + 12 * skill + rng.normal(0, 15, n), 0, 100)
    X = np.column_stack([overall, coverage, confidence, star, fillers, timing, credibility])
    # Rubric used by the panel that "labelled" the synthetic interviews.
    score = 0.85 * overall + 1.6 * coverage + 0.15 * confidence + 0.012 * star - 0.12 * fillers + 0.008 * timing + 0.01 * credibility
    y = (score + rng.normal(0, 0.6, n) > 8.6).astype(int)
    return X, y


@dataclass
class OutcomeModel:
    scaler: StandardScaler
    clf: LogisticRegression
    accuracy: float

    @classmethod
    def train(cls) -> "OutcomeModel":
        X, y = synthetic_dataset()
        split = int(len(X) * 0.8)
        scaler = StandardScaler().fit(X[:split])
        clf = LogisticRegression(max_iter=1000).fit(scaler.transform(X[:split]), y[:split])
        acc = float(clf.score(scaler.transform(X[split:]), y[split:]))
        return cls(scaler=scaler, clf=clf, accuracy=round(acc, 3))

    def predict(self, features: dict) -> dict:
        row = np.array([[float(features.get(f, BASELINE[f]) if features.get(f) is not None else BASELINE[f]) for f in FEATURES]])
        base = np.array([[BASELINE[f] for f in FEATURES]])
        xs = self.scaler.transform(row)[0]
        bs = self.scaler.transform(base)[0]
        prob = float(self.clf.predict_proba(self.scaler.transform(row))[0][1])
        coefs = self.clf.coef_[0]
        drivers = [{"key": f, "label": LABELS[f], "impact": round(float(coefs[i] * (xs[i] - bs[i])), 2)} for i, f in enumerate(FEATURES)]
        drivers.sort(key=lambda d: -abs(d["impact"]))
        pct = int(round(prob * 100))
        band = "Likely to advance" if pct >= 70 else "Borderline" if pct >= 40 else "Unlikely yet"
        return {
            "probability": pct,
            "band": band,
            "helping": [d for d in drivers if d["impact"] > 0.05][:3],
            "hurting": [d for d in drivers if d["impact"] < -0.05][:3],
            "model": "sklearn-logreg-v1",
            "holdout_accuracy": self.accuracy,
            "disclaimer": DISCLAIMER,
        }

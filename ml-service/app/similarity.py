"""TF-IDF based semantic matching for answer gap detection and resume/JD match."""
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .textutil import STOPWORDS, content_stems, sentences, tokenize


def _char_vectorizer() -> TfidfVectorizer:
    # Character n-grams within word boundaries are robust to inflection and typos
    # ("normalisation" vs "normalization", "hashed" vs "hashing").
    return TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, lowercase=True)


def _word_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(analyzer="word", stop_words=list(STOPWORDS), sublinear_tf=True, ngram_range=(1, 2), lowercase=True)


def cosine(a: str, b: str, analyzer: str = "word") -> float:
    if not (a or "").strip() or not (b or "").strip():
        return 0.0
    vec = _char_vectorizer() if analyzer == "char" else _word_vectorizer()
    try:
        m = vec.fit_transform([a, b])
    except ValueError:  # empty vocabulary
        return 0.0
    return float(round(cosine_similarity(m[0], m[1])[0][0], 3))


def key_point_coverage(answer: str, key_points: list[str]) -> dict:
    answer_stems = set(content_stems(answer))
    units = sentences(answer) or [answer]
    covered, missing = [], []
    detail = []
    vec = _char_vectorizer()
    alts_all = [[a.strip() for a in str(kp).split("|") if a.strip()] for kp in key_points]
    flat = [a for alts in alts_all for a in alts]
    sim_matrix = None
    if flat and any(u.strip() for u in units):
        try:
            m = vec.fit_transform(units + flat)
            sim_matrix = cosine_similarity(m[len(units):], m[: len(units)])
        except ValueError:
            sim_matrix = None
    offset = 0
    for alts in alts_all:
        best = 0.0
        hit = False
        for j, alt in enumerate(alts):
            stems = [s for s in content_stems(alt)]
            if stems:
                overlap = sum(1 for s in stems if s in answer_stems) / len(stems)
                if overlap >= (1.0 if len(stems) <= 2 else 0.6):
                    hit = True
            elif all(t in (answer or "").lower() for t in tokenize(alt)):
                hit = True
            if sim_matrix is not None:
                best = max(best, float(sim_matrix[offset + j].max()))
        offset += len(alts)
        # Fuzzy semantic hit on a strong character-level match with one sentence.
        if not hit and best >= 0.42:
            hit = True
        label = alts[0] if alts else ""
        (covered if hit else missing).append(label)
        detail.append({"key_point": label, "covered": hit, "best_similarity": round(best, 3)})
    coverage = round(len(covered) / len(key_points), 2) if key_points else 0.0
    return {"covered": covered, "missing": missing, "coverage": coverage, "detail": detail}


def keywords(text: str, k: int = 8) -> list[str]:
    toks = [t for t in tokenize(text) if t not in STOPWORDS and len(t) > 2 and not t.isdigit()]
    return [w for w, _ in Counter(toks).most_common(k)]


def shared_terms(a: str, b: str, k: int = 12) -> list[str]:
    vec = _word_vectorizer()
    try:
        m = vec.fit_transform([a, b]).toarray()
    except ValueError:
        return []
    terms = np.array(vec.get_feature_names_out())
    joint = np.minimum(m[0], m[1])
    order = np.argsort(-joint)
    return [str(terms[i]) for i in order[:k] if joint[i] > 0]

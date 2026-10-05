"""Small text helpers shared by the analysers (kept dependency-free on purpose)."""
import re

STOPWORDS = set(
    """a an the and or but if then else of to in on at by for with from as is are was were be been being it its this that
    these those i me my we our you your he she they them their his her what which who whom when where why how do does did
    done have has had can could should would will shall may might must not no so than too very just also into about over
    under up down out there here all any some such only own same each few more most other both again further once""".split()
)

TOKEN_RE = re.compile(r"[^\W_][\w+#.&()-]*[\w+#)]|[^\W_]", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return [t.rstrip(".") for t in TOKEN_RE.findall((text or "").lower())]


def stem(word: str) -> str:
    w = word
    if len(w) <= 3 or not w.isascii() or not w.isalpha():
        return w
    for suffix, rep in (("ies", "y"), ("ied", "y"), ("sses", "ss"), ("ization", "ize"), ("isation", "ize"),
                        ("ational", "ate"), ("ness", ""), ("ment", ""), ("ing", ""), ("ed", ""), ("ly", ""),
                        ("er", ""), ("s", ""), ("e", "")):
        if w.endswith(suffix) and len(w) - len(suffix) + len(rep) >= 3:
            if suffix == "s" and w.endswith("ss"):
                continue
            w = w[: len(w) - len(suffix)] + rep
            if suffix == "s" and w.endswith("e") and len(w) > 3:
                w = w[:-1]
            break
    return w


def content_stems(text: str) -> list[str]:
    return [stem(t) for t in tokenize(text) if t not in STOPWORDS]


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?।])\s+|\n+", (text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    count = len(groups)
    if w.endswith("e") and count > 1 and not w.endswith("le"):
        count -= 1
    return max(1, count)


def flesch_reading_ease(text: str) -> float | None:
    words = [w for w in tokenize(text) if re.search(r"[a-z]", w)]
    sents = sentences(text)
    if len(words) < 5 or not sents:
        return None
    syl = sum(syllables(w) for w in words)
    score = 206.835 - 1.015 * (len(words) / len(sents)) - 84.6 * (syl / len(words))
    return round(max(0.0, min(100.0, score)), 1)

from fastapi.testclient import TestClient

from app.main import app
from app.outcome import OutcomeModel, synthetic_dataset
from app.similarity import cosine, key_point_coverage, shared_terms
from app.textutil import flesch_reading_ease, stem, tokenize


def client() -> TestClient:
    return TestClient(app)


def test_health_reports_model():
    with client() as c:
        r = c.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["model_ready"] is True
        assert body["holdout_accuracy"] > 0.8


def test_tokenize_and_stem():
    assert "node.js" in tokenize("I used Node.js daily")
    assert stem("hashing") == stem("hashed")


def test_key_point_coverage_handles_alternatives_and_fuzzy_spelling():
    res = key_point_coverage(
        "Passwords are hashed with bcrypt plus a random salt. Normalisation is not relevant.",
        ["hash", "salt", "bcrypt|argon2", "https|tls"],
    )
    assert res["covered"] == ["hash", "salt", "bcrypt"]
    assert res["missing"] == ["https"]
    assert res["coverage"] == 0.75


def test_cosine_bounds():
    assert cosine("", "abc") == 0.0
    s = cosine("database index speeds reads", "an index speeds up database reads")
    assert 0.3 < s <= 1.0


def test_readability():
    assert flesch_reading_ease("short") is None
    assert 0 <= flesch_reading_ease("I built the app. It was fast. Users liked it a lot.") <= 100


def test_analyze_answer_endpoint():
    with client() as c:
        r = c.post("/v1/analyze/answer", json={
            "answer": "TCP is reliable and connection oriented. HTTP is in the application layer.",
            "question": "Where do HTTP and TCP sit in the OSI model?",
            "key_points": ["application layer", "transport layer", "tcp reliable|connection oriented"],
        })
        assert r.status_code == 200
        body = r.json()
        assert "application layer" in body["covered"]
        assert "transport layer" in body["missing"]
        assert 0 <= body["similarity"] <= 1
        assert body["keywords"]


def test_analyze_validates_size():
    with client() as c:
        r = c.post("/v1/analyze/answer", json={"answer": "x", "key_points": ["a"] * 50})
        assert r.status_code == 422


def test_match_endpoint():
    with client() as c:
        r = c.post("/v1/match", json={"resume_text": "Angular Node.js MongoDB developer", "jd_text": "We need an Angular and Node.js developer"})
        assert r.status_code == 200
        assert r.json()["similarity"] > 0
        assert "angular" in r.json()["top_terms"]
    assert shared_terms("", "abc") == []


def test_outcome_model_is_monotonic_and_explains_itself():
    model = OutcomeModel.train()
    weak = model.predict({"overall": 3.5, "coverage": 0.3, "confidence": 4, "star": 30, "fillers": 8, "timing": 50})
    strong = model.predict({"overall": 9, "coverage": 0.9, "confidence": 8.5, "star": 90, "fillers": 1, "timing": 95, "credibility": 85})
    assert strong["probability"] > 80 > 20 > weak["probability"]
    assert strong["helping"] and weak["hurting"]
    assert strong["band"] == "Likely to advance"


def test_outcome_endpoint_ignores_unknown_features():
    with client() as c:
        r = c.post("/v1/predict/outcome", json={"features": {"overall": 7, "coverage": 0.7, "hack": 1e9, "credibility": None}})
        assert r.status_code == 200
        assert 0 <= r.json()["probability"] <= 100


def test_dataset_is_deterministic():
    X1, y1 = synthetic_dataset(100)
    X2, y2 = synthetic_dataset(100)
    assert (X1 == X2).all() and (y1 == y2).all()

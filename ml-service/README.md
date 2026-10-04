# Vivace ML service

FastAPI service used by the Node API when `ML_SERVICE_URL` is set. Optional — the portal falls back to JavaScript engines.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Readiness + outcome model hold-out accuracy |
| `POST /v1/analyze/answer` | Key-point coverage (stems + TF-IDF char n-grams), similarity, keywords, readability |
| `POST /v1/match` | Resume ↔ JD TF-IDF similarity and shared terms |
| `POST /v1/predict/outcome` | Logistic-regression outcome probability with feature contributions |

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8001
python -m pytest -q
```

"""Vivace ML service — semantic text analysis and outcome prediction.

The Node API calls this service when ML_SERVICE_URL is configured and falls back
to its own JavaScript engines when it is not, so the portal works either way.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .outcome import FEATURES, OutcomeModel
from .similarity import cosine, key_point_coverage, keywords, shared_terms
from .textutil import flesch_reading_ease

state: dict = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    state["outcome"] = OutcomeModel.train()
    yield
    state.clear()


app = FastAPI(title="Vivace ML service", version="1.0.0", lifespan=lifespan)


class AnswerIn(BaseModel):
    answer: str = Field(default="", max_length=12000)
    question: str = Field(default="", max_length=2000)
    key_points: list[str] = Field(default_factory=list, max_length=12)


class MatchIn(BaseModel):
    resume_text: str = Field(default="", max_length=60000)
    jd_text: str = Field(min_length=1, max_length=20000)


class OutcomeIn(BaseModel):
    features: dict[str, float | None]


@app.get("/health")
def health() -> dict:
    model = state.get("outcome")
    return {"status": "ok", "model_ready": model is not None, "holdout_accuracy": model.accuracy if model else None}


@app.post("/v1/analyze/answer")
def analyze_answer(body: AnswerIn) -> dict:
    gaps = key_point_coverage(body.answer, body.key_points)
    reference = " ".join([body.question, *[kp.replace("|", " ") for kp in body.key_points]])
    return {
        **gaps,
        "similarity": cosine(body.answer, reference, analyzer="char"),
        "keywords": keywords(body.answer),
        "readability": flesch_reading_ease(body.answer),
    }


@app.post("/v1/match")
def match(body: MatchIn) -> dict:
    return {
        "similarity": cosine(body.resume_text, body.jd_text, analyzer="word"),
        "top_terms": shared_terms(body.resume_text, body.jd_text),
    }


@app.post("/v1/predict/outcome")
def predict_outcome(body: OutcomeIn) -> dict:
    features = {k: v for k, v in body.features.items() if k in FEATURES}
    return state["outcome"].predict(features)

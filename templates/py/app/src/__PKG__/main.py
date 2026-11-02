import os

from fastapi import FastAPI

app = FastAPI(title="__NAME__")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def run() -> None:
    import uvicorn

    # `or`: an empty PORT falls back to the default instead of failing int("").
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT") or "8000"))

from fastapi import FastAPI
from .routes.health import router as health_router
from .routes.summarize import router as summarize_router
from .routes.embed import router as embed_router

app = FastAPI(title="summarizer-py")

app.include_router(health_router)
app.include_router(summarize_router)
app.include_router(embed_router)

if __name__ == "__main__":
    import uvicorn
    import os
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))


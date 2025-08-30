import asyncio
import os
from fastapi import FastAPI
from .routes.health import router as health_router
from .worker import Worker


app = FastAPI(title="worker-py")
app.include_router(health_router)


worker: Worker | None = None


@app.on_event("startup")
async def on_startup():
    global worker
    worker = Worker()
    asyncio.create_task(worker.run_forever())


@app.on_event("shutdown")
async def on_shutdown():
    global worker
    if worker:
        await worker.stop()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 9000)))


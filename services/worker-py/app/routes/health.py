from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "worker-py", "time": datetime.utcnow().isoformat() + "Z"}


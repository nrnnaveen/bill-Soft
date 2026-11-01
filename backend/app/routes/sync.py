from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import SyncPushRequest, SyncPushResponse, SyncPullResponse
from ..services.sync_service import process_push, process_pull

router = APIRouter(prefix="/api/sync", tags=["Synchronization"])


@router.post("/push", response_model=SyncPushResponse)
def sync_push(request: SyncPushRequest, db: Session = Depends(get_db)):
    """
    Accepts batch of offline invoices, stock adjustments, and newly created products.
    Applies them to server database idempotently and reports any concurrent sale conflicts.
    """
    return process_push(db, request)


@router.get("/pull", response_model=SyncPullResponse)
def sync_pull(db: Session = Depends(get_db)):
    """
    Pulls current products, settings, and recent invoices for offline cache hydration.
    """
    return process_pull(db)

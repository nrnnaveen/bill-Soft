from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ShopSettings
from ..schemas import ShopSettingsUpdate, ShopSettingsOut
from ..services.storage_service import upload_seal, get_seal_bytes

router = APIRouter(prefix="/api/settings", tags=["Settings"])


def get_or_create_settings(db: Session) -> ShopSettings:
    settings = db.query(ShopSettings).filter(ShopSettings.id == 1).first()
    if not settings:
        settings = ShopSettings(
            id=1,
            shop_name="K.N. 181. Kanyakumari Mahathma Gandhi Human Resource Management & Skill Development Co-operative Society Ltd.",
            address="12-145, 142G/1, S.A. Complex, Pampanvilai Road, Asaripallam-629201, Kanyakumari Dist.",
            gstin="33AAKAK0961H1ZP",
            email="kmghrmsdcooperativesociety@gmail.com",
            contact_no="8015913892",
            state="Tamilnadu",
            state_code="33",
            invoice_prefix="INV-",
            device_invoice_prefix="INV-DEV1-",
            next_invoice_number=1,
            default_terms="1. Goods once sold will not be taken back.\n2. Any damages during Transport, report immediate in front of Driver / Delivery Person.\n3. Warranty norms as per the product with guide.",
            seal_image_path=None,
            default_is_gst=True,
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=ShopSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return get_or_create_settings(db)


@router.put("", response_model=ShopSettingsOut)
def update_settings(
    settings_in: ShopSettingsUpdate,
    db: Session = Depends(get_db),
):
    settings = get_or_create_settings(db)
    data = settings_in.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


@router.post("/seal", response_model=ShopSettingsOut)
async def upload_seal_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Validate content type
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format '{file.content_type}'. Please upload PNG or JPEG."
        )

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Seal image file size must be less than 5MB.")

    # Validate image magic signature bytes to prevent file extension masquerading
    is_png = file_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    is_jpeg = file_bytes.startswith(b"\xff\xd8\xff")
    is_webp = file_bytes.startswith(b"RIFF") and len(file_bytes) > 12 and file_bytes[8:12] == b"WEBP"

    if not (is_png or is_jpeg or is_webp):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image format (PNG, JPEG, or WEBP required)."
        )

    settings = get_or_create_settings(db)

    # Store via storage service (Supabase private bucket or persistent local storage)
    storage_path = upload_seal(
        file_bytes=file_bytes,
        filename=file.filename or "authorized_seal.png",
        content_type=file.content_type,
    )

    settings.seal_image_path = storage_path
    db.commit()
    db.refresh(settings)
    return settings


@router.delete("/seal", response_model=ShopSettingsOut)
def delete_seal_image(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    settings.seal_image_path = None
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/seal-image")
def stream_seal_image(db: Session = Depends(get_db)):
    """
    Secure proxy endpoint that streams the uploaded authorized seal image.
    Never exposes Supabase private keys or storage credentials to the client.
    """
    settings = get_or_create_settings(db)
    if not settings.seal_image_path:
        raise HTTPException(status_code=404, detail="No authorized seal uploaded.")

    result = get_seal_bytes(settings.seal_image_path)
    if not result:
        raise HTTPException(status_code=404, detail="Seal image not found in storage.")

    data, mime = result
    return Response(content=data, media_type=mime)


@router.post("/backup")
def trigger_backup(db: Session = Depends(get_db)):
    """
    Triggers automated backup of database tables and authorized seal image.
    """
    import subprocess
    import sys
    import os

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    export_script = os.path.join(backend_dir, "scripts", "export_db.py")
    seal_script = os.path.join(backend_dir, "scripts", "backup_seal.py")
    python_bin = sys.executable

    res1 = subprocess.run([python_bin, export_script], capture_output=True, text=True)
    res2 = subprocess.run([python_bin, seal_script], capture_output=True, text=True)

    if res1.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Database export error: {res1.stderr}")

    return {
        "status": "success",
        "message": "Database and seal backed up successfully!",
        "export_log": res1.stdout.strip(),
        "seal_log": res2.stdout.strip(),
    }


@router.get("/db-status")
def get_db_status():
    """Returns database backend target, engine, and connection health."""
    from ..database import get_database_status
    return get_database_status()



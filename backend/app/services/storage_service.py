import os
import mimetypes
from typing import Optional, Tuple
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(BASE_DIR, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
BUCKET_NAME = os.getenv("SUPABASE_STORAGE_BUCKET", "shop-assets").strip()

LOCAL_UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(LOCAL_UPLOADS_DIR, exist_ok=True)

_supabase_client = None

def get_supabase_client():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            from supabase import create_client, Client
            _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
            return _supabase_client
        except Exception as e:
            print(f"[Supabase Storage Warning] Could not initialize client: {e}")
            return None
    return None


def ensure_bucket_exists():
    client = get_supabase_client()
    if client:
        try:
            buckets = client.storage.list_buckets()
            bucket_names = [b.name for b in buckets]
            if BUCKET_NAME not in bucket_names:
                # Create private bucket for authorized seal
                client.storage.create_bucket(BUCKET_NAME, options={"public": False})
        except Exception as e:
            print(f"[Supabase Storage Bucket Notice] {e}")


def upload_seal(file_bytes: bytes, filename: str, content_type: str) -> str:
    """
    Uploads the authorized seal image to private Supabase Storage if configured.
    Falls back to local file storage if Supabase credentials are not set.
    Returns the storage path to save in shop_settings.seal_image_path.
    """
    ext = os.path.splitext(filename)[1].lower() or ".png"
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        ext = ".png"

    storage_path = f"seals/authorized_seal{ext}"

    client = get_supabase_client()
    if client:
        ensure_bucket_exists()
        try:
            # Upsert into private bucket
            client.storage.from_(BUCKET_NAME).upload(
                file=file_bytes,
                path=storage_path,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            return f"supabase://{BUCKET_NAME}/{storage_path}"
        except Exception as e:
            print(f"[Supabase Storage Upload Error, falling back to local] {e}")

    # Local fallback with secure sanitized path
    safe_name = f"authorized_seal{ext}"
    local_dest = os.path.abspath(os.path.join(LOCAL_UPLOADS_DIR, safe_name))
    with open(local_dest, "wb") as f:
        f.write(file_bytes)
    return f"local://{safe_name}"


def get_seal_bytes(storage_path: Optional[str]) -> Optional[Tuple[bytes, str]]:
    """
    Retrieves the raw image bytes and mime type for the stored seal.
    Keeps private bucket credentials secure on the backend and enforces strict path boundaries.
    """
    if not storage_path:
        return None

    if storage_path.startswith("supabase://"):
        client = get_supabase_client()
        if client:
            try:
                # Remove supabase:// prefix
                clean = storage_path.replace("supabase://", "", 1)
                bucket, path = clean.split("/", 1)
                data = client.storage.from_(bucket).download(path)
                mime = mimetypes.guess_type(path)[0] or "image/png"
                return data, mime
            except Exception as e:
                print(f"[Supabase Storage Download Error] {e}")
                return None

    if storage_path.startswith("local://"):
        raw_name = storage_path.replace("local://", "", 1)
        filename = os.path.basename(raw_name)
        full_path = os.path.abspath(os.path.join(LOCAL_UPLOADS_DIR, filename))
        # Enforce that resolved path is strictly inside LOCAL_UPLOADS_DIR
        base_dir = os.path.abspath(LOCAL_UPLOADS_DIR)
        if full_path.startswith(base_dir) and os.path.exists(full_path):
            with open(full_path, "rb") as f:
                data = f.read()
            mime = mimetypes.guess_type(full_path)[0] or "image/png"
            return data, mime

    return None

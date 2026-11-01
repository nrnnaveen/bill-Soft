import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, Base, SessionLocal, init_db
from .models import ShopSettings
from .routes import products, invoices, settings, sync

# Ensure tables are ready on startup
init_db()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Initialize default settings if not exists
    db = SessionLocal()
    try:
        existing = db.query(ShopSettings).filter(ShopSettings.id == 1).first()
        if not existing:
            default_settings = ShopSettings(
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
            db.add(default_settings)
            db.commit()
    finally:
        db.close()

    yield


app = FastAPI(
    title="Shop Billing & Inventory Management API",
    version="1.0.0",
    description="Backend API for Shop Billing, Inventory Tracking, Supabase PostgreSQL & Storage",
    lifespan=lifespan,
)

# CORS Configuration
allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(settings.router)
app.include_router(sync.router)


@app.get("/api/health")
def health_check():
    from .database import get_database_status
    db_stat = get_database_status()
    return {
        "status": "healthy" if db_stat["connected"] else "degraded",
        "service": "Shop Billing & Inventory API",
        **db_stat
    }

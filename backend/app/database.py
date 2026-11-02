import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables from .env if present
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
REQUIRE_SUPABASE = os.getenv("REQUIRE_SUPABASE", "false").strip().lower() in ("true", "1", "yes")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# If using postgresql URI format from some providers (postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_production = APP_ENV in ("production", "prod")
is_postgres = DATABASE_URL.startswith("postgresql://")

# Production safety guard: Strictly disallow silent SQLite fallback in production or when REQUIRE_SUPABASE=true
if is_production or REQUIRE_SUPABASE:
    if not DATABASE_URL or not is_postgres:
        raise RuntimeError(
            "FATAL: Production mode or REQUIRE_SUPABASE is enabled, but no valid PostgreSQL/Supabase "
            "DATABASE_URL was configured. Silent fallback to SQLite is strictly forbidden in production."
        )

if DATABASE_URL:
    try:
        # Supabase PostgreSQL Engine
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    except Exception as e:
        if is_production or REQUIRE_SUPABASE:
            raise RuntimeError(
                f"FATAL: Failed to initialize Supabase PostgreSQL engine: {e}. "
                "Silent fallback to SQLite is disallowed."
            ) from e
        raise
else:
    # Local fallback to SQLite (Development / Isolated test mode only)
    DATA_DIR = os.path.join(BASE_DIR, "data")
    os.makedirs(DATA_DIR, exist_ok=True)
    sqlite_path = os.path.join(DATA_DIR, "shop_billing.db")
    DATABASE_URL = f"sqlite:///{sqlite_path}"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )

    # Enable foreign keys for SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_database_status() -> dict:
    """Returns the current database engine, cloud target info, and live connection status."""
    is_pg = engine.dialect.name == "postgresql"
    if is_pg:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(DATABASE_URL)
            host = parsed.hostname or "cloud"
            target = f"Supabase PostgreSQL ({host})"
        except Exception:
            target = "Supabase PostgreSQL"
    else:
        target = "Local SQLite (data/shop_billing.db)"

    # Live Database read verification (SELECT 1)
    db_read_verified = False
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_read_verified = True
    except Exception:
        db_read_verified = False

    # Supabase Cloud Storage & REST reachability check
    supabase_configured = bool(os.getenv("SUPABASE_URL", "").strip() and os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    supabase_cloud_reachable = False
    if supabase_configured:
        try:
            from .services.storage_service import get_supabase_client
            client = get_supabase_client()
            if client:
                buckets = client.storage.list_buckets()
                supabase_cloud_reachable = True
        except Exception:
            supabase_cloud_reachable = False

    status_label = "connected" if db_read_verified else "disconnected"

    return {
        "engine": engine.dialect.name,
        "is_cloud_database": is_pg,
        "database_target": target,
        "connected": db_read_verified,
        "database_read_verified": db_read_verified,
        "supabase_configured": supabase_configured,
        "supabase_cloud_reachable": supabase_cloud_reachable,
        "status": status_label,
        "environment": APP_ENV,
        "require_supabase": REQUIRE_SUPABASE,
    }

def init_db():
    from . import models
    Base.metadata.create_all(bind=engine)

    # Safe migration: add missing columns to existing SQLite/Postgres tables if needed
    from sqlalchemy import inspect, text
    inspector = inspect(engine)

    with engine.connect() as conn:
        # Check shop_settings table
        if "shop_settings" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("shop_settings")]
            if "device_invoice_prefix" not in columns:
                conn.execute(text("ALTER TABLE shop_settings ADD COLUMN device_invoice_prefix VARCHAR(20) DEFAULT 'INV-DEV1-'"))
                conn.commit()

        # Check invoices table
        if "invoices" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("invoices")]
            if "discount_amount" not in columns:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN discount_amount FLOAT DEFAULT 0.0"))
            if "client_uuid" not in columns:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN client_uuid VARCHAR(100)"))
            if "device_id" not in columns:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN device_id VARCHAR(50)"))
            conn.commit()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


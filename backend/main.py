from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, storage

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Paths
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
UPLOAD_DIR = BACKEND_DIR / "uploads" / "payment_screenshots"
DATA_DIR = BACKEND_DIR / "data"
REGISTRATIONS_FILE = DATA_DIR / "registrations.jsonl"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PIXELORA Backend", version="1.0.0")

ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "*").strip()


def parse_allowed_origins(raw_value: str) -> list[str]:
    if not raw_value or raw_value == "*":
        return ["*"]
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


ALLOWED_ORIGINS = parse_allowed_origins(ALLOWED_ORIGINS_RAW)
ALLOW_CREDENTIALS = "*" not in ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()

firebase_db = None
firebase_bucket = None

if FIREBASE_SERVICE_ACCOUNT_JSON:
    service_account_info = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
    firebase_options: dict[str, str] = {}
    if FIREBASE_STORAGE_BUCKET:
        firebase_options["storageBucket"] = FIREBASE_STORAGE_BUCKET

    if not firebase_admin._apps:
        firebase_app = firebase_admin.initialize_app(
            credentials.Certificate(service_account_info),
            firebase_options if firebase_options else None,
        )
    else:
        firebase_app = firebase_admin.get_app()

    firebase_db = firestore.client(app=firebase_app)
    if FIREBASE_STORAGE_BUCKET:
        firebase_bucket = storage.bucket(app=firebase_app)

ALLOWED_YEARS = {"I-Year", "II-Year", "III-Year", "IV-Year"}
ALLOWED_TECHNICAL_EVENTS = {"Innopitch", "Devfolio", "Promptcraft"}
ALLOWED_NON_TECHNICAL_EVENTS = {
    "E-Sports (Free fire)",
    "IPL Auction",
    "Visual Connect",
    "Channel Surfing",
}
ALLOWED_FOOD = {"Veg", "Non-Veg"}

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/registrations")
async def create_registration(
    name: str = Form(...),
    email: str = Form(...),
    whatsapp: str = Form(...),
    year: str = Form(...),
    collegeName: str = Form(...),
    departmentName: str = Form(...),
    technicalEvents: str = Form(...),
    nonTechnicalEvents: str = Form(...),
    technicalTeamName: str | None = Form(None),
    technicalTeamLeader: str | None = Form(None),
    technicalTeamSize: str | None = Form(None),
    technicalTeamMembers: str | None = Form(None),
    nonTechnicalTeamName: str | None = Form(None),
    nonTechnicalTeamLeader: str | None = Form(None),
    nonTechnicalTeamSize: str | None = Form(None),
    nonTechnicalTeamMembers: str | None = Form(None),
    food: str = Form(...),
    paymentScreenshot: UploadFile = File(...),
) -> dict[str, str]:
    name = name.strip()
    email = email.strip()
    whatsapp = whatsapp.strip()
    year = year.strip()
    collegeName = collegeName.strip()
    departmentName = departmentName.strip()
    technicalEvents = technicalEvents.strip()
    nonTechnicalEvents = nonTechnicalEvents.strip()
    technicalTeamName = (technicalTeamName or '').strip() or None
    technicalTeamLeader = (technicalTeamLeader or '').strip() or None
    technicalTeamSize = (technicalTeamSize or '').strip() or None
    technicalTeamMembers = (technicalTeamMembers or '').strip() or None
    nonTechnicalTeamName = (nonTechnicalTeamName or '').strip() or None
    nonTechnicalTeamLeader = (nonTechnicalTeamLeader or '').strip() or None
    nonTechnicalTeamSize = (nonTechnicalTeamSize or '').strip() or None
    nonTechnicalTeamMembers = (nonTechnicalTeamMembers or '').strip() or None
    food = food.strip()

    if not all(
        [
            name,
            email,
            whatsapp,
            year,
            collegeName,
            departmentName,
            technicalEvents,
            nonTechnicalEvents,
            food,
        ]
    ):
        raise HTTPException(status_code=400, detail="All fields are required.")

    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="Invalid email format.")

    if year not in ALLOWED_YEARS:
        raise HTTPException(status_code=400, detail="Invalid year selection.")

    if technicalEvents not in ALLOWED_TECHNICAL_EVENTS:
        raise HTTPException(status_code=400, detail="Invalid technical event selection.")

    if nonTechnicalEvents not in ALLOWED_NON_TECHNICAL_EVENTS:
        raise HTTPException(status_code=400, detail="Invalid non-technical event selection.")

    if food not in ALLOWED_FOOD:
        raise HTTPException(status_code=400, detail="Invalid food selection.")

    if not paymentScreenshot.content_type or not paymentScreenshot.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Payment screenshot must be an image.")

    suffix = Path(paymentScreenshot.filename or "screenshot").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"

    registration_id = uuid.uuid4().hex
    image_filename = f"{registration_id}{suffix}"
    image_path = UPLOAD_DIR / image_filename

    image_bytes = await paymentScreenshot.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded screenshot is empty.")

    payment_screenshot_ref = f"uploads/payment_screenshots/{image_filename}"

    if firebase_bucket is not None:
        blob = firebase_bucket.blob(f"payment_screenshots/{image_filename}")
        blob.upload_from_string(image_bytes, content_type=paymentScreenshot.content_type or "image/jpeg")
        blob.make_public()
        payment_screenshot_ref = blob.public_url
    else:
        image_path.write_bytes(image_bytes)

    created_at = datetime.now(timezone.utc).isoformat()

    parsed_technical_members: list[str] = []
    parsed_nontechnical_members: list[str] = []

    if technicalTeamMembers:
        try:
            parsed_technical_members = [
                str(member).strip()
                for member in json.loads(technicalTeamMembers)
                if str(member).strip()
            ]
        except json.JSONDecodeError:
            parsed_technical_members = []

    if nonTechnicalTeamMembers:
        try:
            parsed_nontechnical_members = [
                str(member).strip()
                for member in json.loads(nonTechnicalTeamMembers)
                if str(member).strip()
            ]
        except json.JSONDecodeError:
            parsed_nontechnical_members = []

    record = {
        "id": registration_id,
        "name": name,
        "email": email,
        "whatsapp": whatsapp,
        "year": year,
        "collegeName": collegeName,
        "departmentName": departmentName,
        "technicalEvents": technicalEvents,
        "nonTechnicalEvents": nonTechnicalEvents,
        "technicalTeam": {
            "teamName": technicalTeamName,
            "teamLeader": technicalTeamLeader,
            "teamSize": technicalTeamSize,
            "members": parsed_technical_members,
        },
        "nonTechnicalTeam": {
            "teamName": nonTechnicalTeamName,
            "teamLeader": nonTechnicalTeamLeader,
            "teamSize": nonTechnicalTeamSize,
            "members": parsed_nontechnical_members,
        },
        "food": food,
        "paymentScreenshot": payment_screenshot_ref,
        "createdAt": created_at,
    }

    if firebase_db is not None:
        firebase_db.collection("registrations").document(registration_id).set(record)
    else:
        with REGISTRATIONS_FILE.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, ensure_ascii=True) + "\n")

    return {"message": "Registration submitted successfully.", "id": registration_id}


# Serve frontend from the sibling frontend folder so /api and site share one origin.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

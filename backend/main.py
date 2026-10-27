from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import csv
import sqlite3
import uuid

import cv2

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator


# ==========================================
# CONFIGURATION
# ==========================================

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

DATABASE_PATH = BASE_DIR / "forestiQ.db"
ML_OUTPUT_DIR = PROJECT_DIR / "ml" / "outputs"

MAX_UPLOAD_SIZE = 15 * 1024 * 1024

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".tif", ".tiff"
}


# ==========================================
# DATABASE
# ==========================================

def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS plantations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                area_hectares REAL NOT NULL,
                dominant_species TEXT,
                planting_date TEXT,
                created_at TEXT NOT NULL
            )
            """
        )

        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(plantations)"
            ).fetchall()
        }

        if "latitude" not in columns:
            connection.execute(
                "ALTER TABLE plantations ADD COLUMN latitude REAL"
            )

        if "longitude" not in columns:
            connection.execute(
                "ALTER TABLE plantations ADD COLUMN longitude REAL"
            )


# ==========================================
# REQUEST MODEL
# ==========================================

class PlantationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    location: str = Field(min_length=1, max_length=200)
    area_hectares: float = Field(gt=0)

    dominant_species: str | None = None
    planting_date: str | None = None

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "Provide both latitude and longitude, "
                "or leave both empty."
            )

        return self


# ==========================================
# DEEPFOREST MODEL
# ==========================================

_deepforest_model = None


def get_deepforest_model():
    global _deepforest_model

    if _deepforest_model is None:
        print("Loading DeepForest model...")

        from deepforest import main as deepforest_main

        model = deepforest_main.deepforest()
        model.load_model()

        _deepforest_model = model

        print("DeepForest model loaded successfully.")

    return _deepforest_model


# ==========================================
# DRAW PREDICTIONS
# ==========================================

def draw_tree_predictions(image_path, predictions, output_path):
    image = cv2.imread(str(image_path))

    if image is None:
        raise ValueError("Could not read the image.")

    if predictions is not None and not predictions.empty:
        for _, row in predictions.iterrows():
            x1 = int(row["xmin"])
            y1 = int(row["ymin"])
            x2 = int(row["xmax"])
            y2 = int(row["ymax"])

            cv2.rectangle(
                image,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2,
            )

            label = "Tree"

            if "score" in predictions.columns:
                try:
                    label = f"Tree {float(row['score']):.2f}"
                except (ValueError, TypeError):
                    pass

            cv2.putText(
                image,
                label,
                (x1, max(y1 - 6, 15)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                1,
                cv2.LINE_AA,
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not cv2.imwrite(str(output_path), image):
        raise RuntimeError("Could not save the annotated image.")

    return output_path


# ==========================================
# APPLICATION LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    ML_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Database: {DATABASE_PATH}")
    print(f"ML outputs: {ML_OUTPUT_DIR}")

    yield


# ==========================================
# FASTAPI APP
# ==========================================

app = FastAPI(
    title="ForestIQ AI API",
    description=(
        "Afforestation tracking, plantation management, "
        "and DeepForest tree detection."
    ),
    version="1.4.1",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# HEALTH CHECKS
# ==========================================

@app.get("/")
def home():
    return {
        "message": "ForestIQ AI backend is running",
        "version": app.version,
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "application": "ForestIQ AI",
    }


# ==========================================
# PLANTATION APIs
# ==========================================

@app.get("/api/plantations")
def get_plantations():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id, name, location, area_hectares,
                dominant_species, planting_date,
                latitude, longitude, created_at
            FROM plantations
            ORDER BY id DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/plantations", status_code=201)
def create_plantation(plantation: PlantationCreate):
    created_at = datetime.now(timezone.utc).isoformat()

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO plantations (
                    name, location, area_hectares,
                    dominant_species, planting_date,
                    latitude, longitude, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plantation.name.strip(),
                    plantation.location.strip(),
                    plantation.area_hectares,
                    plantation.dominant_species,
                    plantation.planting_date,
                    plantation.latitude,
                    plantation.longitude,
                    created_at,
                ),
            )

            plantation_id = cursor.lastrowid

            row = connection.execute(
                """
                SELECT
                    id, name, location, area_hectares,
                    dominant_species, planting_date,
                    latitude, longitude, created_at
                FROM plantations
                WHERE id = ?
                """,
                (plantation_id,),
            ).fetchone()

            return dict(row)

    except sqlite3.Error as error:
        print("Database error:", repr(error))

        raise HTTPException(
            status_code=500,
            detail="Could not save plantation.",
        ) from error


@app.get("/api/plantations/{plantation_id}")
def get_plantation(plantation_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                id, name, location, area_hectares,
                dominant_species, planting_date,
                latitude, longitude, created_at
            FROM plantations
            WHERE id = ?
            """,
            (plantation_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Plantation not found.",
        )

    return dict(row)


# ==========================================
# LIVE DEEPFOREST PREDICTION
# ==========================================

@app.post("/api/ml/predict")
def predict_uploaded_image(file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Upload a JPG, JPEG, PNG, TIF, or TIFF image.",
        )

    image_id = uuid.uuid4().hex

    input_path = ML_OUTPUT_DIR / f"upload_{image_id}{extension}"
    output_path = ML_OUTPUT_DIR / f"detection_{image_id}.png"

    try:
        total_bytes = 0

        with input_path.open("wb") as destination:
            while True:
                chunk = file.file.read(1024 * 1024)

                if not chunk:
                    break

                total_bytes += len(chunk)

                if total_bytes > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Image exceeds the 15 MB limit.",
                    )

                destination.write(chunk)

        if total_bytes == 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded image is empty.",
            )

        # Run the actual pretrained DeepForest model.
        model = get_deepforest_model()

        predictions = model.predict_image(
            path=str(input_path)
        )

        tree_count = (
            0 if predictions is None else len(predictions)
        )

        mean_confidence = None

        if (
            predictions is not None
            and not predictions.empty
            and "score" in predictions.columns
        ):
            mean_confidence = float(
                predictions["score"].mean()
            )

        # Draw the boxes without using model.plot_results().
        draw_tree_predictions(
            image_path=input_path,
            predictions=predictions,
            output_path=output_path,
        )

        return {
            "success": True,
            "filename": file.filename,
            "predicted_tree_count": int(tree_count),
            "mean_confidence": mean_confidence,
            "annotated_image_url": (
                f"/api/ml/images/{output_path.name}"
            ),
            "note": (
                "Predictions are model estimates, not "
                "verified ground-truth tree counts."
            ),
        }

    except HTTPException:
        raise

    except Exception as error:
        print("DeepForest prediction failed:", repr(error))

        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(error)}",
        ) from error

    finally:
        file.file.close()

        if input_path.exists():
            try:
                input_path.unlink()
            except OSError:
                pass


# ==========================================
# BATCH ML RESULTS
# ==========================================

@app.get("/api/ml/results")
def get_ml_results():
    report_path = ML_OUTPUT_DIR / "deepforest_report.csv"

    if not report_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="ML report not found. Run the batch analysis first.",
        )

    try:
        with report_path.open(
            "r",
            newline="",
            encoding="utf-8-sig",
        ) as report_file:
            results = list(csv.DictReader(report_file))

    except (OSError, csv.Error) as error:
        raise HTTPException(
            status_code=500,
            detail="Could not read the ML report.",
        ) from error

    for item in results:
        raw_count = item.get("predicted_tree_count")
        raw_confidence = item.get("mean_confidence")

        try:
            item["predicted_tree_count"] = (
                int(float(raw_count))
                if raw_count not in (None, "")
                else None
            )
        except (ValueError, TypeError):
            item["predicted_tree_count"] = None

        try:
            item["mean_confidence"] = (
                float(raw_confidence)
                if raw_confidence not in (None, "")
                else None
            )
        except (ValueError, TypeError):
            item["mean_confidence"] = None

        annotated_filename = Path(
            item.get("annotated_image") or ""
        ).name

        if (
            annotated_filename
            and annotated_filename != "."
            and (ML_OUTPUT_DIR / annotated_filename).is_file()
        ):
            item["annotated_image_url"] = (
                f"/api/ml/images/{annotated_filename}"
            )
        else:
            item["annotated_image_url"] = None

    successful = [
        item for item in results
        if item.get("status") == "success"
    ]

    total_detections = sum(
        item.get("predicted_tree_count") or 0
        for item in successful
    )

    return {
        "total_images": len(results),
        "successful_images": len(successful),
        "failed_images": len(results) - len(successful),
        "total_predicted_tree_detections": total_detections,
        "results": results,
        "note": "Predictions are estimates, not verified tree counts.",
    }


# ==========================================
# ANNOTATED IMAGE ENDPOINT
# ==========================================

@app.get("/api/ml/images/{filename}")
def get_ml_image(filename: str):
    if (
        Path(filename).name != filename
        or Path(filename).suffix.lower() != ".png"
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid image filename.",
        )

    image_path = ML_OUTPUT_DIR / filename

    if not image_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Image not found.",
        )

    return FileResponse(
        path=image_path,
        media_type="image/png",
        filename=filename,
    )


# ==========================================
# DOWNLOAD CSV REPORT
# ==========================================

@app.get("/api/ml/report")
def download_ml_report():
    report_path = ML_OUTPUT_DIR / "deepforest_report.csv"

    if not report_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="ML report not found.",
        )

    return FileResponse(
        path=report_path,
        media_type="text/csv",
        filename="deepforest_report.csv",
    )
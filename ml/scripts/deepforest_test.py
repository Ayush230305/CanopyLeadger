from pathlib import Path
import cv2
import pandas as pd
from deepforest import main as deepforest_main


# ==========================================
# CONFIGURATION
# ==========================================

PROJECT_DIR = Path(__file__).resolve().parents[2]

DATASET_DIR = PROJECT_DIR / "ml" / "datasets"
OUTPUT_DIR = PROJECT_DIR / "ml" / "outputs"
REPORT_PATH = OUTPUT_DIR / "deepforest_report.csv"

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".tif", ".tiff"
}


# ==========================================
# DRAW TREE BOUNDING BOXES
# ==========================================

def save_annotated_image(image_path, predictions, output_path):
    image = cv2.imread(str(image_path))

    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

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
        raise RuntimeError(f"Could not save: {output_path}")

    return output_path


# ==========================================
# MAIN BATCH ANALYSIS
# ==========================================

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not DATASET_DIR.exists():
        print(f"Dataset directory not found: {DATASET_DIR}")
        return

    image_paths = sorted(
        path
        for path in DATASET_DIR.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not image_paths:
        print(f"No images found in: {DATASET_DIR}")
        return

    print("=" * 45)
    print("FORESTIQ AI - DEEPFOREST TREE DETECTION")
    print("=" * 45)
    print(f"Images found: {len(image_paths)}")

    # Load the pretrained model once.
    print("\nLoading pretrained DeepForest model...")

    model = deepforest_main.deepforest()
    model.load_model()

    print("DeepForest model loaded successfully.\n")

    results = []

    for index, image_path in enumerate(image_paths, start=1):
        print(
            f"[{index}/{len(image_paths)}] "
            f"Processing {image_path.name}..."
        )

        output_path = OUTPUT_DIR / (
            f"annotated_{image_path.stem}.jpg"
        )

        try:
            predictions = model.predict_image(
                path=str(image_path)
            )

            tree_count = (
                0
                if predictions is None
                else len(predictions)
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

            save_annotated_image(
                image_path=image_path,
                predictions=predictions,
                output_path=output_path,
            )

            results.append({
                "image": image_path.name,
                "predicted_tree_count": int(tree_count),
                "mean_confidence": mean_confidence,
                "annotated_image": output_path.name,
                "status": "success",
            })

            print(f"  Predicted trees: {tree_count}")
            print(f"  Saved image: {output_path.name}")

        except Exception as error:
            print(f"  ERROR: {error}")

            results.append({
                "image": image_path.name,
                "predicted_tree_count": None,
                "mean_confidence": None,
                "annotated_image": "",
                "status": f"failed: {error}",
            })

    # Write the report even if some images fail.
    report = pd.DataFrame(results)

    report.to_csv(
        REPORT_PATH,
        index=False,
        encoding="utf-8",
    )

    successful = sum(
        result["status"] == "success"
        for result in results
    )

    total_predictions = sum(
        result["predicted_tree_count"] or 0
        for result in results
        if result["status"] == "success"
    )

    print("\n" + "=" * 45)
    print("BATCH ANALYSIS COMPLETE")
    print("=" * 45)
    print(f"Images processed: {len(results)}")
    print(f"Successful images: {successful}")
    print(f"Failed images: {len(results) - successful}")
    print(f"Total predicted detections: {total_predictions}")
    print(f"CSV report: {REPORT_PATH}")

    print(
        "\nNote: These are model predictions, not "
        "verified ground-truth tree counts."
    )


if __name__ == "__main__":
    main()
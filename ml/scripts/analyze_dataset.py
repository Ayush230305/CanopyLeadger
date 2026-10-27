import csv
import sys
from pathlib import Path

# Locate the current scripts directory
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Import the existing canopy analysis function
from canopy_analysis import analyze_canopy

# Define project paths
BASE_DIR = SCRIPT_DIR.parents[1]
DATASET_DIR = BASE_DIR / "ml" / "datasets"
OUTPUT_DIR = BASE_DIR / "ml" / "outputs"
REPORT_FILE = OUTPUT_DIR / "vegetation_report.csv"

# Supported image formats
SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".webp"
}


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find all images in the dataset folder
    images = sorted(
        image for image in DATASET_DIR.iterdir()
        if image.is_file()
        and image.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not images:
        print(f"No images found in {DATASET_DIR}")
        return

    print(f"Found {len(images)} images.")
    print("Starting batch analysis...")

    results = []

    # Analyze every image
    for image_path in images:
        print(f"\nProcessing: {image_path.name}")

        try:
            result = analyze_canopy(
                str(image_path),
                str(OUTPUT_DIR)
            )

            results.append({
                "image": image_path.name,
                "width": result["image_width"],
                "height": result["image_height"],
                "total_pixels": result["total_pixels"],
                "vegetation_pixels": result["vegetation_pixels"],
                "vegetation_coverage_percent":
                    result["estimated_vegetation_coverage_percent"],
                "method": result["method"],
                "status": "success"
            })

        except Exception as error:
            print(f"Error processing {image_path.name}: {error}")

            results.append({
                "image": image_path.name,
                "width": "",
                "height": "",
                "total_pixels": "",
                "vegetation_pixels": "",
                "vegetation_coverage_percent": "",
                "method": "HSV green-pixel thresholding",
                "status": f"failed: {error}"
            })

    # Save results to a CSV file
    fieldnames = [
        "image",
        "width",
        "height",
        "total_pixels",
        "vegetation_pixels",
        "vegetation_coverage_percent",
        "method",
        "status"
    ]

    with REPORT_FILE.open(
        "w", newline="", encoding="utf-8"
    ) as csv_file:
        writer = csv.DictWriter(
            csv_file, fieldnames=fieldnames
        )
        writer.writeheader()
        writer.writerows(results)

    # Print summary
    successful = [
        row for row in results
        if row["status"] == "success"
    ]

    print("\n========== DATASET SUMMARY ==========")
    print(f"Total images: {len(images)}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(results) - len(successful)}")

    if successful:
        average = sum(
            float(row["vegetation_coverage_percent"])
            for row in successful
        ) / len(successful)

        print(
            "Average image-level vegetation coverage: "
            f"{average:.2f}%"
        )

    print(f"\nCSV report saved to: {REPORT_FILE}")
    print(f"Image outputs saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

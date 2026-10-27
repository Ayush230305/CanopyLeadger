import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def analyze_canopy(image_path, output_dir="ml/outputs"):

    # 1. Resolve project directory
    project_dir = Path(__file__).resolve().parents[2]

    # 2. Locate and load the input image
    image_file = Path(image_path)

    if not image_file.is_absolute():
        image_file = Path.cwd() / image_file

    if not image_file.exists():
        raise FileNotFoundError(
            f"Image not found: {image_file}"
        )

    image = cv2.imread(str(image_file))

    if image is None:
        raise ValueError(
            f"Unable to read image: {image_file}"
        )

    height, width = image.shape[:2]

    print(f"Loaded image: {image_file}")
    print(f"Image dimensions: {width} x {height}")

    # 3. Convert BGR image to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # 4. Define the green color range
    lower_green = np.array([25, 35, 25])
    upper_green = np.array([95, 255, 255])

    # 5. Generate vegetation mask
    mask = cv2.inRange(
        hsv,
        lower_green,
        upper_green
    )

    # 6. Remove noise and fill small gaps
    kernel = np.ones((3, 3), dtype=np.uint8)

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        kernel
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel
    )

    # 7. Calculate approximate vegetation coverage
    total_pixels = height * width
    vegetation_pixels = cv2.countNonZero(mask)

    coverage = (
        vegetation_pixels / total_pixels * 100
        if total_pixels > 0
        else 0.0
    )

    # 8. Create overlay highlighting detected green pixels
    overlay = image.copy()
    overlay[mask > 0] = (0, 255, 0)

    overlay = cv2.addWeighted(
        image,
        0.65,
        overlay,
        0.35,
        0
    )

    # 9. Resolve output directory
    output_path = Path(output_dir)

    if not output_path.is_absolute():
        output_path = project_dir / output_path

    output_path.mkdir(
        parents=True,
        exist_ok=True
    )

    # 10. Define output filenames
    mask_path = (
        output_path / f"{image_file.stem}_mask.png"
    )

    overlay_path = (
        output_path / f"{image_file.stem}_overlay.png"
    )

    # 11. Save the mask
    if not cv2.imwrite(str(mask_path), mask):
        raise RuntimeError(
            f"Could not save mask: {mask_path}"
        )

    # 12. Save overlay using Pillow
    overlay_rgb = cv2.cvtColor(
        overlay,
        cv2.COLOR_BGR2RGB
    )

    try:
        Image.fromarray(overlay_rgb).save(
            str(overlay_path),
            format="PNG"
        )
    except Exception as error:
        raise RuntimeError(
            f"Could not save overlay to "
            f"{overlay_path}: {error}"
        ) from error

    # 13. Display results
    print("\n--- ForestIQ-AI Analysis Results ---")
    print(f"Vegetation pixels: {vegetation_pixels:,}")
    print(
        f"Approximate vegetation coverage: "
        f"{coverage:.2f}%"
    )
    print(f"Mask saved to: {mask_path}")
    print(f"Overlay saved to: {overlay_path}")
    print("Analysis completed successfully!")

    # 14. Return measurements for batch processing
    return {
        "image_width": int(width),
        "image_height": int(height),
        "total_pixels": int(total_pixels),
        "vegetation_pixels": int(vegetation_pixels),
        "estimated_vegetation_coverage_percent": round(
            float(coverage), 2
        ),
        "method": "HSV green-pixel thresholding",
    }


if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "ForestIQ-AI vegetation coverage analysis"
        )
    )

    parser.add_argument(
        "--image",
        required=True,
        help="Path to the input image"
    )

    parser.add_argument(
        "--output",
        default="ml/outputs",
        help="Directory for generated output images"
    )

    args = parser.parse_args()

    analyze_canopy(
        args.image,
        args.output
    )

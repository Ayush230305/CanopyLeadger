import argparse
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO


PROJECT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = "yolov8n-seg.pt"


def analyze_image(image_path, output_dir="ml/outputs"):
    image_path = Path(image_path)

    if not image_path.is_absolute():
        image_path = Path.cwd() / image_path

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    image = cv2.imread(str(image_path))

    if image is None:
        raise ValueError(f"Cannot read image: {image_path}")

    output_path = Path(output_dir)

    if not output_path.is_absolute():
        output_path = PROJECT_DIR / output_path

    output_path.mkdir(parents=True, exist_ok=True)

    # Load pretrained YOLO segmentation model
    model = YOLO(DEFAULT_MODEL)

    # Run segmentation inference
    results = model.predict(
        source=str(image_path),
        conf=0.25,
        verbose=False
    )

    result = results[0]
    overlay = image.copy()
    combined_mask = np.zeros(
        image.shape[:2],
        dtype=np.uint8
    )

    detected_objects = []

    if result.boxes is not None and result.masks is not None:
        masks = result.masks.data.cpu().numpy()
        classes = result.boxes.cls.cpu().numpy().astype(int)
        confidences = result.boxes.conf.cpu().numpy()

        for index, class_id in enumerate(classes):
            class_name = model.names[class_id]
            confidence = float(confidences[index])

            # Record every detected object for inspection.
            detected_objects.append({
                "class": class_name,
                "confidence": round(confidence, 4)
            })

            # COCO does not contain a dedicated tree-canopy class.
            # Therefore, do not treat all detected objects as trees.
            if class_name == "potted plant":
                mask = cv2.resize(
                    masks[index],
                    (image.shape[1], image.shape[0]),
                    interpolation=cv2.INTER_NEAREST
                )

                binary_mask = (mask > 0.5).astype(np.uint8) * 255
                combined_mask = cv2.bitwise_or(
                    combined_mask,
                    binary_mask
                )

    # Highlight the detected potted-plant regions, if any.
    overlay[combined_mask > 0] = (0, 255, 0)

    overlay = cv2.addWeighted(
        image,
        0.65,
        overlay,
        0.35,
        0
    )

    mask_file = output_path / f"{image_path.stem}_yolo_mask.png"
    overlay_file = output_path / f"{image_path.stem}_yolo_overlay.png"

    if not cv2.imwrite(str(mask_file), combined_mask):
        raise RuntimeError(f"Could not save mask: {mask_file}")

    if not cv2.imwrite(str(overlay_file), overlay):
        raise RuntimeError(f"Could not save overlay: {overlay_file}")

    detected_pixels = cv2.countNonZero(combined_mask)
    total_pixels = image.shape[0] * image.shape[1]

    coverage = (
        detected_pixels / total_pixels * 100
        if total_pixels
        else 0
    )

    print("\n--- ForestIQ-AI YOLO Results ---")
    print(f"Image: {image_path.name}")
    print(f"Objects detected: {len(detected_objects)}")
    print(f"Detected classes: {detected_objects}")
    print(f"Potted-plant pixel coverage: {coverage:.2f}%")
    print(f"Mask saved: {mask_file}")
    print(f"Overlay saved: {overlay_file}")

    print(
        "\nNote: This is a pretrained general-object model. "
        "Its potted-plant detections are not validated tree-canopy "
        "measurements. Zero coverage does not mean zero trees."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test pretrained YOLO segmentation on an image"
    )

    parser.add_argument(
        "--image",
        required=True,
        help="Path to input image"
    )

    parser.add_argument(
        "--output",
        default="ml/outputs",
        help="Output directory"
    )

    args = parser.parse_args()

    analyze_image(args.image, args.output)
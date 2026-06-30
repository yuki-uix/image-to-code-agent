#!/usr/bin/env python3
import argparse
import json
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageStat
except ImportError:
    print("visual-diff: Pillow is required for visual comparison (python3 -m pip install Pillow)", file=sys.stderr)
    sys.exit(2)


def parse_args():
    parser = argparse.ArgumentParser(description="Compare a page reference image with a browser-rendered screenshot.")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--actual", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--design-source", help="design-source.json containing the page-layout bbox")
    parser.add_argument("--threshold", type=float, default=0.90)
    parser.add_argument("--partial-threshold", type=float, default=0.75)
    return parser.parse_args()


def page_bbox(path):
    data = json.loads(Path(path).read_text())
    for region in data.get("regions", []):
        if region.get("role") == "page-layout":
            box = region.get("bbox", {})
            return (
                round(float(box["x"])),
                round(float(box["y"])),
                round(float(box["x"]) + float(box["width"])),
                round(float(box["y"]) + float(box["height"])),
            )
    raise ValueError("design-source.json has no page-layout region")


def mean_similarity(first, second):
    diff = ImageChops.difference(first, second)
    means = ImageStat.Stat(diff).mean
    return max(0.0, 1.0 - (sum(means) / len(means) / 255.0)), diff


def edge_similarity(first, second):
    first_edges = first.convert("L").filter(ImageFilter.FIND_EDGES)
    second_edges = second.convert("L").filter(ImageFilter.FIND_EDGES)
    value, _ = mean_similarity(first_edges, second_edges)
    return value


def pixel_agreement(diff, tolerance=12):
    gray = diff.convert("L")
    histogram = gray.histogram()
    agreed = sum(histogram[: tolerance + 1])
    return agreed / max(1, gray.width * gray.height)


def tile_scores(reference, actual, rows=4, columns=4):
    scores = []
    width, height = reference.size
    for row in range(rows):
        for column in range(columns):
            left = round(column * width / columns)
            top = round(row * height / rows)
            right = round((column + 1) * width / columns)
            bottom = round((row + 1) * height / rows)
            similarity, _ = mean_similarity(reference.crop((left, top, right, bottom)), actual.crop((left, top, right, bottom)))
            scores.append({
                "row": row + 1,
                "column": column + 1,
                "bbox": {"x": left, "y": top, "width": right - left, "height": bottom - top},
                "similarity": round(similarity, 4),
            })
    return sorted(scores, key=lambda item: item["similarity"])


def main():
    args = parse_args()
    output_dir = Path(args.out).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    reference_original = Image.open(args.reference).convert("RGB")
    if args.design_source:
        reference = reference_original.crop(page_bbox(args.design_source))
    else:
        reference = reference_original
    actual_original = Image.open(args.actual).convert("RGB")

    reference_path = output_dir / "reference.png"
    actual_path = output_dir / "actual.png"
    resized_path = output_dir / "actual-resized.png"
    overlay_path = output_dir / "overlay.png"
    diff_path = output_dir / "diff.png"
    report_path = output_dir / "visual-eval.json"

    reference.save(reference_path)
    if Path(args.actual).resolve() != actual_path:
        shutil.copyfile(args.actual, actual_path)

    ref_width, ref_height = reference.size
    actual_width, actual_height = actual_original.size
    width_similarity = min(ref_width, actual_width) / max(ref_width, actual_width)
    height_similarity = min(ref_height, actual_height) / max(ref_height, actual_height)
    dimension_similarity = width_similarity * height_similarity

    actual = actual_original.resize(reference.size, Image.Resampling.LANCZOS)
    actual.save(resized_path)
    color_similarity, diff = mean_similarity(reference, actual)
    structure_similarity = edge_similarity(reference, actual)
    agreement = pixel_agreement(diff)
    visual_similarity = 0.45 * color_similarity + 0.35 * structure_similarity + 0.20 * agreement
    overall = visual_similarity * dimension_similarity

    Image.blend(reference, actual, 0.5).save(overlay_path)
    ImageEnhance.Contrast(diff).enhance(2.5).save(diff_path)
    worst_tiles = tile_scores(reference, actual)[:5]

    if overall >= args.threshold and dimension_similarity >= 0.97:
        verdict = "pass"
        action = "accept"
    elif overall >= args.partial_threshold:
        verdict = "partial"
        action = "one-targeted-repair"
    else:
        verdict = "fail"
        action = "one-targeted-repair"

    report = {
        "valid": verdict == "pass",
        "verdict": verdict,
        "scores": {
            "overall": round(overall, 4),
            "visualSimilarity": round(visual_similarity, 4),
            "colorSimilarity": round(color_similarity, 4),
            "structureSimilarity": round(structure_similarity, 4),
            "pixelAgreement": round(agreement, 4),
            "dimensionSimilarity": round(dimension_similarity, 4),
        },
        "dimensions": {
            "reference": {"width": ref_width, "height": ref_height},
            "actual": {"width": actual_width, "height": actual_height},
        },
        "worstTiles": worst_tiles,
        "recommendedAction": action,
        "artifacts": {
            "reference": str(reference_path),
            "actual": str(actual_path),
            "actualResized": str(resized_path),
            "overlay": str(overlay_path),
            "diff": str(diff_path),
            "report": str(report_path),
        },
        "notes": [
            "Pixel scores are triage signals, not proof of semantic correctness.",
            "Use the overlay, diff image, and worst tiles for at most one targeted repair pass.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    sys.exit(0 if verdict == "pass" else 1)


if __name__ == "__main__":
    main()

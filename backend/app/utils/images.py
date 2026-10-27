"""Photo processing on upload (ADR-25): detail stays legible, files stay small."""

import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}  # BR-09, checked on the content, not the header
MAX_PIXELS = 60_000_000  # refuse decompression bombs early (≈ 60 MP covers any phone camera)
OUTPUT_MIME = "image/webp"


class InvalidImage(Exception):
    pass


@dataclass
class ProcessedImage:
    data: bytes
    width: int
    height: int
    mime_type: str = OUTPUT_MIME


def process_photo(raw: bytes, max_edge: int, quality: int) -> ProcessedImage:
    """Verify, upright by EXIF orientation, drop all metadata, shrink to `max_edge` (never enlarge), save WebP."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(raw))
            if probe.format not in ALLOWED_FORMATS:
                raise InvalidImage(probe.format)
            if probe.width * probe.height > MAX_PIXELS:
                raise InvalidImage("too many pixels")
            probe.verify()  # structural check; the probe can't be used afterwards
            img = Image.open(io.BytesIO(raw))
            img.load()
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise InvalidImage(str(exc)) from exc

    img = ImageOps.exif_transpose(img)  # apply camera rotation before the orientation tag is dropped
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.mode or "transparency" in img.info else "RGB")
    img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    img.save(out, "WEBP", quality=quality, method=6)  # no exif= argument: nothing from the camera survives
    return ProcessedImage(data=out.getvalue(), width=img.width, height=img.height)

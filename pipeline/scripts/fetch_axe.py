"""Vendor axe-core into pipeline/vendor/axe.min.js.

Run once after cloning:

    python scripts/fetch_axe.py

We pin the version and commit the file rather than fetching at runtime, for
two reasons. Cloud Run should not depend on a CDN being reachable in the
middle of a demo, and pinning the file pins the rule set — so violation counts
are reproducible between the audit run and the verification re-run, and
between today and Monday.

The checksum is verified before the file is written. axe-core is the ground
truth for every number we put on screen; silently accepting a different build
would undermine that.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

AXE_VERSION = "4.10.2"
URL = f"https://cdn.jsdelivr.net/npm/axe-core@{AXE_VERSION}/axe.min.js"
DEST = Path(__file__).parent.parent / "vendor" / "axe.min.js"

# Populated on first successful fetch; see --print-hash below.
EXPECTED_SHA256 = "b511cd9dec01c76f4b2ad1723b66b6db37d4c2eb4ed199076e1829d9ee7b75e3"


def main() -> int:
    print(f"Fetching axe-core {AXE_VERSION}")
    print(f"  from {URL}")

    with urllib.request.urlopen(URL, timeout=60) as response:
        payload = response.read()

    digest = hashlib.sha256(payload).hexdigest()
    size_kb = len(payload) / 1024
    print(f"  {size_kb:.0f} KB, sha256 {digest}")

    if EXPECTED_SHA256 and digest != EXPECTED_SHA256:
        print(
            f"\nCHECKSUM MISMATCH\n  expected {EXPECTED_SHA256}\n  got      {digest}\n"
            "Refusing to write. Investigate before continuing — this file is "
            "the ground truth for every number in the demo.",
            file=sys.stderr,
        )
        return 1

    if not EXPECTED_SHA256:
        print(
            "\nNote: EXPECTED_SHA256 is empty. Paste the digest above into "
            "this script so future runs are verified."
        )

    # Sanity check: it should look like axe, not an error page or a redirect.
    text = payload.decode("utf-8", errors="replace")
    if "axe" not in text[:2000].lower():
        print("Downloaded content does not look like axe-core.", file=sys.stderr)
        return 1

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_bytes(payload)
    print(f"\nWrote {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

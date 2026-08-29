"""Guards on the finding lifecycle.

These exist because the failure they prevent — showing a fix that was never
checked — is the exact thing that cost accessiBe $1M. A regression here is not
a cosmetic bug.

Run: python -m tests.test_lifecycle
"""

from __future__ import annotations

import sys

from a11ysentinel.models import (
    Finding,
    FindingStatus,
    Framework,
    Severity,
    Source,
    UnverifiedFindingError,
)

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        FAILURES.append(name)


def expect_raises(name: str, fn, exc=Exception) -> None:
    try:
        fn()
    except exc:
        print(f"  PASS  {name}")
    except Exception as other:  # noqa: BLE001
        print(f"  FAIL  {name}  raised {type(other).__name__}: {other}")
        FAILURES.append(name)
    else:
        print(f"  FAIL  {name}  did not raise")
        FAILURES.append(name)


def base(**overrides) -> dict:
    data = dict(
        findingId="f_001",
        pageUrl="https://example.com",
        source=Source.AXE,
        category="button-name",
        wcagCriterion="4.1.2",
        rgaaCriterion="7.1",
        severity=Severity.CRITICAL,
        userImpact="A screen reader user cannot tell what the button does.",
        selector="button.submit",
        currentCode="<button class='submit'></button>",
        framework=Framework.HTML,
        confidence=1.0,
    )
    data.update(overrides)
    return data


def main() -> int:
    print("\nFinding lifecycle guards\n")

    f = Finding(**base())
    check("a new axe finding defaults to detected", f.status is FindingStatus.DETECTED)
    check("a detected finding is not verified", f.verified is False)
    check("a detected finding has no patch", f.patchedCode is None)

    expect_raises(
        "detected + patchedCode is rejected",
        lambda: Finding(**base(status=FindingStatus.DETECTED, patchedCode="<button/>")),
        ValueError,
    )
    expect_raises(
        "verified without a patch is rejected",
        lambda: Finding(**base(status=FindingStatus.VERIFIED, verified=True)),
        ValueError,
    )
    expect_raises(
        "verified flag contradicting status is rejected",
        lambda: Finding(**base(status=FindingStatus.PATCHED, patchedCode="<b/>", verified=True)),
        ValueError,
    )
    expect_raises(
        "requiresHumanInput without guidance is rejected",
        lambda: Finding(**base(requiresHumanInput=True)),
        ValueError,
    )

    print("\nWrite gate\n")

    detected = Finding(**base())
    try:
        detected.validate_for_write()
        print("  PASS  a detected finding may be written")
    except UnverifiedFindingError as exc:
        print(f"  FAIL  a detected finding may be written  {exc}")
        FAILURES.append("detected writable")

    patched = Finding(**base())
    patched.mark_patched("<button class='submit' aria-label='Send'></button>", "Named it.")
    check("mark_patched moves status to patched", patched.status is FindingStatus.PATCHED)
    check("mark_patched does not set verified", patched.verified is False)
    expect_raises(
        "a patched finding is REFUSED at the write gate",
        patched.validate_for_write,
        UnverifiedFindingError,
    )

    patched.mark_verified()
    check("mark_verified moves status to verified", patched.status is FindingStatus.VERIFIED)
    check("mark_verified sets the verified flag", patched.verified is True)
    try:
        patched.validate_for_write()
        print("  PASS  a verified finding may be written")
    except UnverifiedFindingError as exc:
        print(f"  FAIL  a verified finding may be written  {exc}")
        FAILURES.append("verified writable")

    expect_raises(
        "cannot verify a finding with no patch",
        Finding(**base()).mark_verified,
        UnverifiedFindingError,
    )

    low = Finding(**base(confidence=0.5))
    expect_raises(
        "low confidence is refused at the write gate",
        low.validate_for_write,
        UnverifiedFindingError,
    )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}\n")
        return 1
    print("All lifecycle guards hold.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

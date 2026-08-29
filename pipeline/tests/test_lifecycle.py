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
        regionalFramework="RGAA 4",
        regionalCriterion="7.1",
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

    test_revert()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}\n")
        return 1
    print("All lifecycle guards hold.\n")
    return 0




def test_revert() -> int:
    """A patch that fails verification must not take the finding with it."""
    print("\nFailed patches revert rather than vanish\n")
    failures = 0

    f = Finding(**base())
    f.mark_patched("<button aria-label='Send'></button>", "Named the button.")
    check("a drafted patch sits at patched", f.status is FindingStatus.PATCHED)

    f.revert_to_detected()
    check("revert returns it to detected", f.status is FindingStatus.DETECTED)
    check("revert clears the patch", f.patchedCode is None)
    check("revert clears the summary", f.changeSummary is None)
    check("revert clears verified", f.verified is False)

    try:
        f.validate_for_write()
        print("  PASS  a reverted finding can be written, so the violation is still reported")
    except UnverifiedFindingError as exc:
        print(f"  FAIL  a reverted finding should be writable  {exc}")
        failures += 1

    # requiresHumanInput must be cleared too, or invariant 3 breaks: the flag
    # would survive with no guidance and no patch to attach it to.
    g = Finding(**base())
    g.mark_patched("<img alt='TODO'>", "Added a placeholder.")
    g.requiresHumanInput = True
    g.humanGuidance = "Describe the photo."
    g.revert_to_detected()
    check("revert clears requiresHumanInput", g.requiresHumanInput is False)
    check("revert clears humanGuidance", g.humanGuidance is None)
    try:
        g.validate_for_write()
        print("  PASS  a reverted human-input finding still passes the gate")
    except UnverifiedFindingError as exc:
        print(f"  FAIL  reverted human-input finding rejected  {exc}")
        failures += 1

    return failures


if __name__ == "__main__":
    sys.exit(main())

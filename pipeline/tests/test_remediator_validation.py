"""Checks on what the Remediator will accept back from the model.

These are the rules the prompt asks for, enforced again in code. Every case
here came from something a live model actually did, or something it plausibly
could do. No network calls.

Run: python -m tests.test_remediator_validation
"""

from __future__ import annotations

import sys

from a11ysentinel.models import Finding, Framework, Severity, Source, UnverifiedFindingError
from a11ysentinel.remediator import _validate

FAILURES: list[str] = []
ORIGINAL = '<button class="btn-primary" type="submit"><i class="icon-send"></i></button>'


def finding() -> Finding:
    return Finding(
        findingId="f_001",
        pageUrl="https://example.test",
        source=Source.AXE,
        category="button-name",
        wcagCriterion="4.1.2",
        severity=Severity.CRITICAL,
        userImpact="A screen reader user hears only 'button'.",
        selector="button.btn-primary",
        currentCode=ORIGINAL,
        framework=Framework.HTML,
        confidence=1.0,
    )


def response(**overrides) -> dict:
    data = {
        "currentCode": ORIGINAL,
        "patchedCode": ORIGINAL.replace("<i ", 'aria-label="Send"><i '),
        "changeSummary": "Added an accessible name to the submit button.",
        "requiresHumanInput": False,
        "humanGuidance": None,
        "framework": "html",
        "wcagCriterion": "4.1.2",
        "confidence": 0.95,
    }
    data.update(overrides)
    return data


def expect(name: str, data: dict, should_accept: bool) -> None:
    accepted, reason = _validate(finding(), data, 0.7)
    if accepted == should_accept:
        detail = "" if should_accept else f"  ({reason})"
        print(f"  PASS  {name}{detail}")
    else:
        print(f"  FAIL  {name}  accepted={accepted} reason={reason}")
        FAILURES.append(name)


def main() -> int:
    print("\nRemediator response validation\n")

    expect("a well-formed patch is accepted", response(), True)

    print()
    expect("empty patch is refused", response(patchedCode=""), False)
    expect("patch identical to original is refused", response(patchedCode=ORIGINAL), False)
    expect(
        "confidence 5.0 is refused as uninterpretable",
        response(confidence=5.0),
        False,
    )
    expect("negative confidence is refused", response(confidence=-0.2), False)
    expect("confidence below the floor is refused", response(confidence=0.4), False)
    expect(
        "requiresHumanInput without guidance is refused",
        response(requiresHumanInput=True, humanGuidance=None),
        False,
    )
    expect(
        "guidance without requiresHumanInput is refused",
        response(requiresHumanInput=False, humanGuidance="Do something"),
        False,
    )
    expect(
        "a whole-component rewrite is refused as non-minimal",
        response(patchedCode="<div>" + "x" * 900 + "</div>"),
        False,
    )

    print()
    expect(
        "a genuine requiresHumanInput patch is accepted",
        response(
            requiresHumanInput=True,
            humanGuidance="Replace the placeholder with what the photo shows.",
        ),
        True,
    )

    print("\nWrite gate catches assignment that bypassed the validators\n")

    # Pydantic validates at construction, not on assignment. This is the exact
    # hole a live confidence of 5.0 fell through.
    f = finding()
    f.mark_patched(response()["patchedCode"], "Added an accessible name.")
    f.mark_verified()
    f.confidence = 5.0  # no validation fires here
    try:
        f.validate_for_write()
        print("  FAIL  out-of-range confidence reached the write gate")
        FAILURES.append("revalidation")
    except UnverifiedFindingError:
        print("  PASS  out-of-range confidence set by assignment is caught at the gate")

    g = finding()
    g.mark_patched(response()["patchedCode"], "Added an accessible name.")
    g.mark_verified()
    g.requiresHumanInput = True  # guidance now missing — invariant 3 broken
    try:
        g.validate_for_write()
        print("  FAIL  requiresHumanInput without guidance reached the write gate")
        FAILURES.append("revalidation-guidance")
    except UnverifiedFindingError:
        print("  PASS  requiresHumanInput without guidance is caught at the gate")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}\n")
        return 1
    print("All Remediator validation checks hold.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

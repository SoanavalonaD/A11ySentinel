"""Checks on what Agent 8 will accept back from the model.

The prompt asks for claim discipline. This is where it is enforced. Every case
below is something a model plausibly writes when asked to make an accessibility
email compelling — the failure mode is not gibberish, it is fluent, persuasive
copy that asserts more than we measured.

The refusals matter more than the acceptances. A draft that trips a rule is
discarded whole rather than repaired, so these tests are the difference between
"we told the model not to" and "it cannot".

No network calls.

Run: python -m tests.test_outreach_guards
"""

from __future__ import annotations

import asyncio
import sys

from a11ysentinel.models import Finding, Framework, Severity, Source
from a11ysentinel.outreach import _validate, language_is_screened, screen
from a11ysentinel.outreach import draft as run_draft

FAILURES: list[str] = []


def findings() -> list[Finding]:
    return [
        Finding(
            findingId="f_001",
            pageUrl="https://example.test",
            source=Source.AXE,
            category="button-name",
            wcagCriterion="4.1.2",
            severity=Severity.CRITICAL,
            userImpact="A screen reader user hears only 'button' on the contact form.",
            selector="button.btn-primary",
            currentCode="<button></button>",
            framework=Framework.HTML,
            confidence=1.0,
            triageRank=1,
        ),
        Finding(
            findingId="f_002",
            pageUrl="https://example.test",
            source=Source.AXE,
            category="image-alt",
            wcagCriterion="1.1.1",
            severity=Severity.SERIOUS,
            userImpact="The price chart is announced only as 'image'.",
            selector="img.chart",
            currentCode="<img src='c.png'>",
            framework=Framework.HTML,
            confidence=1.0,
            triageRank=2,
        ),
    ]


GOOD_OPENING = (
    "We ran an automated accessibility audit on your site without being asked, "
    "and wanted to share what it found."
)
GOOD_CLOSING = "The full report is attached if it is useful to you."


def response(**overrides) -> dict:
    data = {
        "opening": GOOD_OPENING,
        "highlights": [
            {
                "findingId": "f_001",
                "sentence": (
                    "Someone using a screen reader reaches your contact form and "
                    "hears only 'button', with no way to tell what it does."
                ),
            }
        ],
        "closing": GOOD_CLOSING,
    }
    data.update(overrides)
    return data


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}{(' — ' + detail) if detail else ''}")
        FAILURES.append(name)


def expect_refused(name: str, data: dict, because: str) -> None:
    draft = _validate(data, findings())
    check(
        name,
        not draft.drafted and draft.reason is not None,
        f"expected refusal ({because}), got drafted={draft.drafted}",
    )


def main() -> int:
    print("\nAccepts a clean draft")
    draft = _validate(response(), findings())
    check("clean draft is accepted", draft.drafted)
    check("model_used is recorded", draft.model_used)
    check("highlight is kept", len(draft.highlights) == 1)
    check("highlight cites the supplied id", draft.highlights[0].findingId == "f_001")

    print("\nRefuses legal and compliance claims")
    for phrase, label in [
        ("Your site is not compliant with accessibility standards.", "compliance"),
        ("This may expose you to legal liability.", "liability"),
        ("Sites like this have faced lawsuits.", "lawsuit"),
        ("You could be fined for these issues.", "fine"),
        ("This violates the ADA.", "ADA"),
        ("We can certify your site as accessible.", "certification"),
        ("We guarantee these fixes resolve it.", "guarantee"),
    ]:
        expect_refused(f"refuses {label}", response(closing=phrase), label)

    print("\nRefuses urgency and fear framing")
    for phrase, label in [
        ("You are at risk until these are addressed.", "risk framing"),
        ("Please act now to avoid problems.", "act now"),
        ("There is a deadline for this.", "deadline"),
    ]:
        expect_refused(f"refuses {label}", response(closing=phrase), label)

    print("\nRefuses claiming the site is fixed")
    for phrase, label in [
        ("We fixed these problems for you.", "we fixed"),
        ("Your site is now fully accessible.", "fully accessible"),
        ("All issues are resolved.", "all resolved"),
    ]:
        expect_refused(f"refuses {label}", response(closing=phrase), label)

    print("\nScreens the whole body, not one field")
    expect_refused(
        "refuses a banned phrase in the opening",
        response(opening="Your site is not compliant and this is urgent, " + GOOD_OPENING),
        "opening",
    )
    expect_refused(
        "refuses a banned phrase inside a highlight",
        response(
            highlights=[
                {
                    "findingId": "f_001",
                    "sentence": (
                        "This unlabelled button leaves you exposed to legal "
                        "liability from screen reader users who cannot use it."
                    ),
                }
            ]
        ),
        "highlight",
    )

    print("\nRefuses ungrounded highlights")
    expect_refused(
        "refuses an invented findingId",
        response(
            highlights=[
                {
                    "findingId": "f_999",
                    "sentence": (
                        "Your checkout flow traps keyboard users on the payment step."
                    ),
                }
            ]
        ),
        "unknown id",
    )
    expect_refused(
        "refuses a draft with no usable highlight",
        response(highlights=[]),
        "empty highlights",
    )

    print("\nRefuses malformed shape")
    expect_refused("refuses a missing opening", response(opening=""), "no opening")
    expect_refused("refuses a stub opening", response(opening="Hello."), "too short")
    expect_refused(
        "refuses an over-length opening", response(opening="x" * 600), "over length"
    )

    print("\nDrops bad highlights without losing good ones")
    draft = _validate(
        response(
            highlights=[
                {"findingId": "f_999", "sentence": "An invented finding about nothing real."},
                {
                    "findingId": "f_002",
                    "sentence": "Your price chart is announced only as 'image', so its numbers are lost.",
                },
                {"findingId": "f_002", "sentence": "A duplicate of the finding above, repeated."},
                {"findingId": "f_001", "sentence": "too short"},
            ]
        ),
        findings(),
    )
    check("keeps the one grounded highlight", draft.drafted and len(draft.highlights) == 1)
    check(
        "kept highlight is the real one",
        draft.drafted and draft.highlights[0].findingId == "f_002",
    )

    print("\nOrdinary words survive the screen")
    for word in [
        "This is an issue worth a look.",
        "We want to ensure the report is useful.",
        "The fine print is in the report.",
        "This defines what a screen reader announces.",
        "Please assure yourself by reading it.",
    ]:
        check(f"allows {word!r}", not screen(word), f"false positive: {screen(word)}")

    print("\nRefuses the same claims in French")
    # The agent writes in the audited page's language. A screen that only
    # reads English would wave these through — which is the whole point of
    # this block, since the demo site is French-language.
    for phrase, label in [
        ("Votre site n'est pas conforme aux normes d'accessibilite.", "fr conformity"),
        ("Vous engagez votre responsabilite en laissant ces problemes.", "fr liability"),
        ("Cela peut entrainer des poursuites contre votre entreprise.", "fr litigation"),
        ("Vous risquez une amende si rien n'est fait.", "fr penalty"),
        ("Cette situation est illegale au regard de la loi.", "fr illegality"),
        ("Nous garantissons que ces corrections suffisent.", "fr guarantee"),
        ("Votre site est maintenant accessible a tous.", "fr claims fixed"),
        ("Il est urgent d'agir immediatement.", "fr urgency"),
    ]:
        expect_refused(f"refuses {label}", response(closing=phrase), label)

    print("\nOrdinary French survives the screen")
    for word in [
        "Nous avons effectue un audit de votre site.",
        "Le rapport complet est disponible si cela vous est utile.",
        "Une personne utilisant un lecteur d'ecran n'entend que 'bouton'.",
    ]:
        check(f"allows {word!r}", not screen(word), f"false positive: {screen(word)}")

    print("\nCoverage gates generation")
    check("English is screened", language_is_screened("en"))
    check("French is screened", language_is_screened("fr"))
    check("regional tags resolve", language_is_screened("fr-CA") and language_is_screened("en-GB"))
    check("unknown language is treated as English", language_is_screened(None))
    check("German is not screened", not language_is_screened("de"))
    check("Malagasy is not screened", not language_is_screened("mg"))

    unscreened = asyncio.run(
        run_draft(findings(), target_url="https://example.test", language="de", screen_input=False)
    )
    check(
        "refuses to draft in an unscreened language",
        not unscreened.drafted and "no claim-discipline screen" in (unscreened.reason or ""),
        f"got drafted={unscreened.drafted} reason={unscreened.reason!r}",
    )
    check(
        "does not call the model for an unscreened language",
        not unscreened.model_used,
    )

    print("\nscreen() names the rule it broke")
    hits = screen("You may be liable and face a lawsuit.")
    check("reports every breach", len(hits) >= 2, str(hits))
    check("names liability", any("liability" in h for h in hits), str(hits))

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed: {', '.join(FAILURES)}")
        return 1
    print("All outreach guard checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

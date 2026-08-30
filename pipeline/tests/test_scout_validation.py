"""Checks on what Agent 9 will accept back from a grounded search.

Search grounding and a response schema cannot both be set on one Vertex call,
so unlike every other agent here the scout's output shape is *requested* rather
than enforced. That makes this file the enforcement.

Every case below is something a live model actually produced or plausibly
will: a markdown fence, a top-level array instead of the documented object,
`name` where the prompt said `organisation`, a country spelled out, a deep
link, a Wikipedia article standing in for an organisation's own site.

No network calls.

Run: python -m tests.test_scout_validation
"""

from __future__ import annotations

import sys

from a11ysentinel.scout import (
    Prospect,
    _acceptable,
    _validate,
    normalise_country,
    parse_payload,
)

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}{(' — ' + detail) if detail else ''}")
        FAILURES.append(name)


# The exact string a live model returned on the first grounded run.
FENCED_ARRAY = """```json
[
  {
    "name": "Direction générale des Finances publiques",
    "url": "https://www.impots.gouv.fr",
    "sector": "public-sector",
    "country": "France"
  },
  {
    "name": "RATP",
    "url": "https://www.ratp.fr",
    "sector": "transport",
    "country": "France"
  }
]
```"""

DOCUMENTED = (
    '{"candidates":[{"url":"https://www.caf.fr","organisation":"CAF",'
    '"sector":"public-sector","country":"FR"}]}'
)


def main() -> int:
    print("\nRecovers the shape the model actually sends")
    data, why = parse_payload(FENCED_ARRAY)
    check("parses a fenced top-level array", data is not None, str(why))
    check("finds both candidates", bool(data) and len(data["candidates"]) == 2)

    data2, _ = parse_payload(DOCUMENTED)
    check("parses the documented object", bool(data2) and len(data2["candidates"]) == 1)

    check("rejects empty output", parse_payload("")[0] is None)
    check("rejects prose with no JSON", parse_payload("I could not find any.")[0] is None)
    check(
        "rejects an object with no candidates array",
        parse_payload('{"result":"none"}')[0] is None,
    )

    print("\nAccepts `name` as well as `organisation`")
    result = _validate({"candidates": [
        {"url": "https://www.ratp.fr", "name": "RATP", "sector": "transport", "country": "FR"},
    ]})
    check("keeps a candidate keyed on `name`", len(result.prospects) == 1)
    check(
        "carries the organisation through",
        bool(result.prospects) and result.prospects[0].organisation == "RATP",
    )

    print("\nDrops what cannot be audited")
    result = _validate({"candidates": [
        {"url": "https://www.caf.fr", "organisation": "CAF", "sector": "public-sector", "country": "FR"},
        {"url": "https://fr.wikipedia.org/wiki/RATP", "organisation": "RATP", "sector": "transport", "country": "FR"},
        {"url": "https://www.impots.gouv.fr/particulier/questions", "organisation": "DGFiP", "sector": "public-sector", "country": "FR"},
        {"url": "ftp://files.example.fr", "organisation": "Example", "sector": "other", "country": "FR"},
        {"url": "http://localhost:8080", "organisation": "Local", "sector": "other", "country": "FR"},
        {"url": "https://www.caf.fr", "organisation": "CAF again", "sector": "public-sector", "country": "FR"},
        {"url": "", "organisation": "Nameless", "sector": "other", "country": "FR"},
    ]})
    kept = [p.url for p in result.prospects]
    check("keeps only the real homepage", kept == ["https://www.caf.fr"], str(kept))
    check("dropped six candidates", len(result.discards) == 6, str(result.discards))
    check("names Wikipedia as an aggregator", any("aggregator" in d for d in result.discards))
    check("names the deep link", any("not a homepage" in d for d in result.discards))
    check("names the duplicate host", any("duplicate" in d for d in result.discards))

    print("\nStructural checks")
    for url, ok in [
        ("https://www.caf.fr", True),
        ("https://www.caf.fr/", True),
        ("http://ants.gouv.fr", True),
        ("https://en.wikipedia.org", False),
        ("https://www.ratp.fr/horaires", False),
        ("javascript:alert(1)", False),
        ("https://nohost", False),
    ]:
        check(f"{'accepts' if ok else 'rejects'} {url}", _acceptable(url)[0] is ok)

    print("\nCountry normalisation")
    check("FR stays FR", normalise_country("FR") == "FR")
    check("France becomes FR", normalise_country("France") == "FR")
    # Truncating a name to two characters gives "UN" here, which is why the
    # mapping is explicit rather than a slice.
    check("United States becomes US", normalise_country("United States") == "US")
    check("Belgique becomes BE", normalise_country("Belgique") == "BE")
    check("empty stays empty", normalise_country("") == "")

    print("\nThe context line is a cross-reference, never a determination")
    fr = Prospect("https://www.caf.fr", "CAF", "public-sector", "FR").context_line()
    check("names the sector", "Public-sector body" in fr)
    check("names the framework as context", "RGAA 4" in fr and "usually referenced" in fr)
    check("says it is not a determination", "not a determination" in fr)
    for banned in ("required", "must ", "obliged", "legally", "non-compliant", "liable"):
        check(f"never says {banned!r}", banned not in fr.lower(), fr)

    unknown = Prospect("https://example.mg", "Example", "other", "MG").context_line()
    check("falls back to WCAG alone for an unmapped country", "WCAG 2.1 AA" in unknown)
    check("invents no framework for MG", "RGAA" not in unknown and "508" not in unknown)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed: {', '.join(FAILURES)}")
        return 1
    print("All scout validation checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

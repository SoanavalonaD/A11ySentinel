"""Agent 9 — ProspectScout. Finds candidate sites instead of being handed them.

The prospector could already choose autonomously, but only from `PROSPECT_POOL`
— a list somebody wrote by hand. The decision was the agent's; the world it
decided about was ours. This closes that gap: the agent searches, and the pool
is what it found.

**The model proposes; the rule engine disposes.** A URL from here is a
suggestion and nothing more. Before it reaches an operator it has to survive
robots.txt, an actual page load and an axe run — see `prospector.scan_candidate`.
A site the model invented simply fails to load and never appears. That ordering
is deliberate: a search model asked for real URLs will occasionally produce a
plausible one that has never existed, and the cheapest place to catch that is
by trying it.

**The model never writes the reason.** It returns facts — organisation, sector,
country — and the "why this is a candidate" line is composed here from fixed
wording. Left to write prose, a model asked to find sites that *must* be
accessible will eventually write "this organisation is legally required to
comply", and that is the single claim this project cannot make: which law binds
a site depends on who operates it, where they are established and what sector
they are in, and `jurisdiction.py` returns null rather than guess about far
less. Naming the framework usually referenced for a sector is a cross-reference.
Asserting an obligation is a legal opinion. Composing the sentence in code is
what keeps the difference from eroding.

Grounded in Google Search through Vertex, so the candidates are sites that
exist today rather than sites the model remembers.
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
from dataclasses import dataclass, field

from . import prompts

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "global")

# What the scout looks for when nobody says otherwise. Configuration rather
# than a constant so the same code demos against one region and runs against
# another.
DEFAULT_REGION = os.getenv("SCOUT_REGION", "France and francophone Europe")
DEFAULT_SECTORS = os.getenv(
    "SCOUT_SECTORS", "public-sector, education, transport, health"
)

# Asking for more than this in one call makes the list worse, not longer: the
# model starts padding with near-duplicates from the same organisation.
MAX_CANDIDATES = 12

# Hosts that are never audit targets — aggregators, social platforms and
# link shorteners. A candidate on one of these is a search result that leaked
# through rather than an organisation's own site.
_BLOCKED_HOSTS = frozenset(
    {
        "wikipedia.org",
        "wikimedia.org",
        "google.com",
        "bing.com",
        "duckduckgo.com",
        "facebook.com",
        "twitter.com",
        "x.com",
        "linkedin.com",
        "instagram.com",
        "youtube.com",
        "t.co",
        "bit.ly",
        "goo.gl",
        "github.com",
        "medium.com",
    }
)

# The framing, owned by code. Naming the framework a sector is usually held to
# is a cross-reference; saying an organisation is obliged to meet it is not.
_SECTOR_LABEL = {
    "public-sector": "Public-sector body",
    "education": "Education provider",
    "health": "Health service",
    "transport": "Transport operator",
    "banking": "Bank or insurer",
    "ecommerce": "Online retailer",
    "telecom": "Telecoms provider",
    "media": "Media organisation",
    "other": "Organisation",
}

# Only frameworks we can name factually for a country, matching the
# conservatism of jurisdiction.py. Anything else gets WCAG alone, which is
# what we actually measure everywhere.
_COUNTRY_NAME_TO_CODE = {
    "france": "FR",
    "belgium": "BE",
    "belgique": "BE",
    "luxembourg": "LU",
    "switzerland": "CH",
    "suisse": "CH",
    "canada": "CA",
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "united kingdom": "GB",
    "great britain": "GB",
    "madagascar": "MG",
}


def normalise_country(value: str) -> str:
    """Best-effort ISO 3166-1 alpha-2.

    The scout is asked for a code and usually returns one, but with no
    response schema available it sometimes returns a name. Truncating a name
    to two characters happens to work for France and Belgium and silently
    fails for the United States, so the mapping is explicit.
    """
    raw = (value or "").strip()
    if len(raw) == 2 and raw.isalpha():
        return raw.upper()
    return _COUNTRY_NAME_TO_CODE.get(raw.lower(), raw.upper()[:2])


_COUNTRY_FRAMEWORK = {
    "FR": "RGAA 4",
    "BE": "EN 301 549",
    "LU": "EN 301 549",
    "CH": "EN 301 549",
    "CA": "AODA",
    "US": "Section 508",
    "GB": "EN 301 549",
    "UK": "EN 301 549",
}


@dataclass
class Prospect:
    """One site the scout proposes. Unverified until it has been scanned."""

    url: str
    organisation: str
    sector: str
    country: str

    @property
    def host(self) -> str:
        return urllib.parse.urlsplit(self.url).netloc.lower()

    def context_line(self) -> str:
        """Why this is worth a look. Composed here, never model-written.

        Reads as a cross-reference, not a determination — "usually referenced
        for", not "required to meet".
        """
        label = _SECTOR_LABEL.get(self.sector, _SECTOR_LABEL["other"])
        framework = _COUNTRY_FRAMEWORK.get(normalise_country(self.country))
        where = f" in {self.country}" if self.country else ""
        if framework:
            return (
                f"{label}{where}. WCAG 2.1 AA is what we measure; "
                f"{framework} is the framework usually referenced for this "
                "sector. Context, not a determination of what binds them."
            )
        return (
            f"{label}{where}. Measured against WCAG 2.1 AA, the standard every "
            "regional framework adopts or references."
        )

    def to_contract(self) -> dict:
        return {
            "url": self.url,
            "organisation": self.organisation,
            "sector": self.sector,
            "country": self.country,
            "context": self.context_line(),
        }


@dataclass
class ScoutResult:
    prospects: list[Prospect] = field(default_factory=list)
    model_used: bool = False
    reason: str | None = None
    queries: list[str] = field(default_factory=list)
    discards: list[str] = field(default_factory=list)

    def to_contract(self) -> dict:
        return {
            "prospects": [p.to_contract() for p in self.prospects],
            "modelUsed": self.model_used,
            "reason": self.reason,
            "searchQueries": self.queries,
            "discards": self.discards,
        }


def _client():
    from google import genai

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")
    return genai.Client(vertexai=True, project=project, location=VERTEX_LOCATION)


def _acceptable(url: str) -> tuple[bool, str | None]:
    """Cheap structural checks, before we spend a page load finding out."""
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return False, "unparseable URL"

    if parts.scheme not in ("http", "https"):
        return False, f"scheme {parts.scheme or '(none)'} is not http(s)"
    host = parts.netloc.lower().split(":")[0]
    if not host or "." not in host:
        return False, "no usable hostname"
    if host in ("localhost", "127.0.0.1"):
        return False, "loopback address"

    registrable = ".".join(host.split(".")[-2:])
    if registrable in _BLOCKED_HOSTS:
        return False, f"{registrable} is an aggregator, not an audit target"

    # Homepages only. A deep link is a search result that slipped through, and
    # auditing one page of someone's CMS is not a fair look at their site.
    if parts.path.strip("/"):
        return False, f"not a homepage ({parts.path})"

    return True, None


def _extract_queries(response) -> list[str]:
    """The searches the model actually ran, if Vertex reported them.

    Worth surfacing: it is the difference between showing that the agent
    searched and asserting that it did.
    """
    out: list[str] = []
    try:
        for cand in response.candidates or []:
            meta = getattr(cand, "grounding_metadata", None)
            for q in getattr(meta, "web_search_queries", None) or []:
                if q and q not in out:
                    out.append(q)
    except Exception:  # noqa: BLE001
        pass
    return out


async def discover(
    *,
    region: str | None = None,
    sectors: str | None = None,
    count: int = 8,
    client=None,
    model: str = DEFAULT_MODEL,
) -> ScoutResult:
    """Search for candidate sites. Never raises — an empty list is an answer."""
    region = region or DEFAULT_REGION
    sectors = sectors or DEFAULT_SECTORS
    count = max(1, min(count, MAX_CANDIDATES))

    from google.genai import types

    try:
        client = client or _client()
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompts.build_scout_user_prompt(
                region=region, sectors=sectors, count=count
            ),
            config=types.GenerateContentConfig(
                system_instruction=prompts.SCOUT_SYSTEM,
                temperature=0.4,
                # Search grounding and a response schema cannot both be set on
                # the same call, so the shape is asked for in the prompt and
                # enforced here instead. Grounding is the point: without it the
                # model returns sites it remembers, and memory is exactly where
                # dead URLs come from.
                tools=[types.Tool(google_search=types.GoogleSearch())],
                max_output_tokens=4096,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
    except Exception as exc:  # noqa: BLE001
        return ScoutResult(
            reason=f"scout search failed: {type(exc).__name__}: {exc}",
        )

    queries = _extract_queries(response)
    data, why = parse_payload(response.text or "")
    if data is None:
        return ScoutResult(model_used=True, reason=why, queries=queries)
    return _validate(data, queries=queries)


def parse_payload(text: str) -> tuple[dict | None, str | None]:
    """Recover the candidate list from whatever the model actually sent.

    Grounding rules out a response schema, so the shape is requested in prose
    and prose is a request, not a guarantee. Observed in practice: a fenced
    ```json block wrapping a top-level array, with `name` where the prompt
    asked for `organisation`. Both are accepted rather than rejected — the
    facts are all there, and failing the whole search over a key name would
    throw away eight real searches.
    """
    text = (text or "").strip()
    if not text:
        return None, "scout returned an empty response"

    # Strip a markdown fence if there is one.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    # Either a bare array or an object wrapping one.
    payload = None
    for pattern in (r"\[.*\]", r"\{.*\}"):
        match = re.search(pattern, text, re.DOTALL)
        if not match:
            continue
        try:
            payload = json.loads(match.group(0))
            break
        except json.JSONDecodeError:
            continue

    if payload is None:
        return None, "scout returned no parseable JSON"
    if isinstance(payload, list):
        return {"candidates": payload}, None
    if isinstance(payload, dict):
        items = payload.get("candidates")
        if isinstance(items, list):
            return {"candidates": items}, None
        return None, "scout JSON had no candidates array"
    return None, "scout JSON was not an object or array"


def _validate(data: dict, *, queries: list[str] | None = None) -> ScoutResult:
    """Turn a scout response into prospects, dropping what cannot be audited.

    Split out so the filtering is testable without a network call.
    """
    result = ScoutResult(model_used=True, queries=queries or [])
    seen_hosts: set[str] = set()

    for item in data.get("candidates", []) or []:
        url = (item.get("url") or "").strip()
        # The prompt asks for `organisation`; ungoverned by a schema the
        # model often sends `name`. Same fact, different key.
        org = (item.get("organisation") or item.get("name") or "").strip()
        sector = (item.get("sector") or "other").strip()
        country = (item.get("country") or "").strip()

        if not url or not org:
            result.discards.append("candidate missing a url or organisation")
            continue

        ok, why = _acceptable(url)
        if not ok:
            result.discards.append(f"{url}: {why}")
            continue

        prospect = Prospect(
            url=url,
            organisation=org,
            sector=sector,
            country=normalise_country(country),
        )
        if prospect.host in seen_hosts:
            result.discards.append(f"{url}: duplicate of a host already listed")
            continue

        seen_hosts.add(prospect.host)
        result.prospects.append(prospect)

    if not result.prospects:
        result.reason = "no candidate survived validation"
    return result

"""ProspectPicker — the agent chooses its own target, with no human input.

This is what makes the demo an autonomous agent rather than a form with a
button. Nobody types a URL: the agent reads a pool of candidates, scans them,
decides which one is worth auditing, and says why.

Two things are deliberately separate:

  - the *decision* is autonomous and always real
  - the *pool* it decides from is configuration

That separation is what lets the same code demo safely and run for real. Point
`PROSPECT_POOL` at domains we control for the video — outreach guard 3 requires
the recording to run against our own domain — and at a live directory in
production. The agent behaves identically either way, and on camera it still
picks by itself.

Selection criterion is deliberately not random. Random is not a decision, and
"the agent picked at random" is a weaker story than "the agent scanned four
candidates and chose the one failing the most people". The pick is the
candidate with the highest violation count, and the reason is recorded.
"""

from __future__ import annotations

import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from playwright.async_api import Browser

from . import capture as capture_mod
from . import rule_auditor

USER_AGENT = (
    "Mozilla/5.0 (compatible; A11ySentinel/0.1; "
    "+https://github.com/SoanavalonaD/A11ySentinel) accessibility-audit"
)

# Scanning costs a browser page load each. Bounded so an oversized pool cannot
# turn selection into the most expensive part of the run.
DEFAULT_SCAN_LIMIT = int(os.getenv("PROSPECT_SCAN_LIMIT", "4"))


@dataclass
class Candidate:
    url: str
    violations: int | None = None
    skipped: str | None = None


@dataclass
class Selection:
    """The decision, and everything needed to defend it."""

    chosen: str | None
    reason: str
    considered: list[Candidate] = field(default_factory=list)

    def explain(self) -> str:
        lines = [f"Considered {len(self.considered)} candidates:"]
        for c in self.considered:
            if c.skipped:
                lines.append(f"  - {c.url}: skipped, {c.skipped}")
            else:
                lines.append(f"  - {c.url}: {c.violations} violations")
        lines.append(f"Chose: {self.chosen or 'nothing'} — {self.reason}")
        return "\n".join(lines)


def load_pool() -> list[str]:
    """Candidate URLs, from PROSPECT_POOL or a newline-delimited file.

    Kept as configuration rather than hardcoded so the demo pool and the
    production pool are the same code path.
    """
    raw = os.getenv("PROSPECT_POOL", "").strip()
    if raw:
        return [u.strip() for u in raw.split(",") if u.strip()]

    path = os.getenv("PROSPECT_POOL_FILE", "").strip()
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return [
                line.strip()
                for line in fh
                if line.strip() and not line.startswith("#")
            ]
    return []


def robots_allows(url: str, *, timeout: int = 10) -> tuple[bool, str | None]:
    """Check robots.txt before touching a site.

    We are an uninvited automated visitor. Honouring robots.txt costs one
    request and is the difference between an audit and a scrape. A site we
    cannot read robots for is allowed — absence of a policy is not a refusal.
    """
    try:
        parts = urllib.parse.urlsplit(url)
        robots_url = urllib.parse.urlunsplit(
            (parts.scheme, parts.netloc, "/robots.txt", "", "")
        )
        request = urllib.request.Request(robots_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, ValueError, TimeoutError):
        return True, None

    # Deliberately simple: honour a blanket disallow. A full robots parser is
    # out of scope, and erring toward not-fetching is the right error to make.
    path = parts.path or "/"
    applies = False
    for line in body.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            applies = value == "*"
        elif key == "disallow" and applies and value:
            if value == "/" or path.startswith(value):
                return False, f"robots.txt disallows {value}"
    return True, None


async def scan_candidate(browser: Browser, url: str) -> Candidate:
    """Cheap look at one candidate: load it, run axe, count. No remediation."""
    allowed, why = robots_allows(url)
    if not allowed:
        return Candidate(url, skipped=why)

    try:
        page_capture = await capture_mod.capture_page(browser, url, screenshot=False)
    except Exception as exc:  # noqa: BLE001
        return Candidate(url, skipped=f"could not load: {type(exc).__name__}")

    context = await browser.new_context(viewport=capture_mod.VIEWPORT)
    try:
        page = await context.new_page()
        await page.set_content(page_capture.html, wait_until="domcontentloaded")
        raw = await rule_auditor.run_axe(page)
        return Candidate(url, violations=rule_auditor.count_violations(raw))
    except Exception as exc:  # noqa: BLE001
        return Candidate(url, skipped=f"could not audit: {type(exc).__name__}")
    finally:
        await context.close()


async def pick_target(
    browser: Browser,
    *,
    pool: list[str] | None = None,
    scan_limit: int = DEFAULT_SCAN_LIMIT,
) -> Selection:
    """Choose what to audit. No human in the loop.

    Returns the choice and the evidence behind it, so the decision can be shown
    rather than asserted.
    """
    pool = pool if pool is not None else load_pool()
    if not pool:
        return Selection(
            chosen=None,
            reason=(
                "no candidate pool configured — set PROSPECT_POOL or "
                "PROSPECT_POOL_FILE"
            ),
        )

    considered: list[Candidate] = []
    for url in pool[:scan_limit]:
        considered.append(await scan_candidate(browser, url))

    scanned = [c for c in considered if c.violations is not None]
    if not scanned:
        return Selection(
            chosen=None,
            reason="every candidate was unreachable or disallowed",
            considered=considered,
        )

    best = max(scanned, key=lambda c: c.violations or 0)
    if not best.violations:
        return Selection(
            chosen=None,
            reason=(
                "no candidate had any detectable violations — nothing worth "
                "auditing, which is a legitimate outcome"
            ),
            considered=considered,
        )

    return Selection(
        chosen=best.url,
        reason=(
            f"highest violation count of the {len(scanned)} candidates scanned "
            f"({best.violations} violations)"
        ),
        considered=considered,
    )

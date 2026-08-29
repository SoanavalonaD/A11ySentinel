"""Page capture. Playwright drives Chromium, we keep the DOM and a screenshot.

Everything fetched here is untrusted third-party content (hard rule 6). This
module never interprets page text; it only stores it for later auditing.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from playwright.async_api import Browser, async_playwright

from .models import Framework

DEFAULT_TIMEOUT_MS = int(os.getenv("PAGE_TIMEOUT_MS", "30000"))

# Desktop viewport. Contrast and touch-target findings depend on layout, so
# this needs to stay fixed between the audit run and the verification re-run,
# otherwise the before/after numbers are not comparable.
VIEWPORT = {"width": 1440, "height": 900}


@dataclass
class PageCapture:
    """Everything the audit stages need about one page."""

    url: str
    html: str
    title: str
    framework: Framework
    screenshot_png: bytes | None = None


def _detect_framework(html: str) -> Framework:
    """Best-effort framework detection from the served markup.

    Drives the Remediator prompt so it emits JSX rather than HTML where that
    is what the developer will paste. Wrong guesses degrade to `unknown`,
    which the prompt handles.
    """
    markers = (
        ('data-reactroot', Framework.REACT),
        ('__NEXT_DATA__', Framework.REACT),
        ('id="root"', Framework.REACT),
        ('_next/static', Framework.REACT),
    )
    lowered = html.lower()
    for marker, framework in markers:
        if marker.lower() in lowered:
            return framework
    return Framework.HTML


async def capture_page(
    browser: Browser,
    url: str,
    *,
    screenshot: bool = True,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> PageCapture:
    """Load one page and snapshot it.

    Uses a fresh context per page so cookies and storage from one target
    never leak into another.
    """
    context = await browser.new_context(
        viewport=VIEWPORT,
        # Identify ourselves honestly. We are auditing, not evading.
        user_agent=(
            "Mozilla/5.0 (compatible; A11ySentinel/0.1; "
            "+https://github.com/SoanavalonaD/A11ySentinel) accessibility-audit"
        ),
    )
    try:
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)

        # networkidle is unreliable on pages with polling or analytics beacons.
        # Settle briefly instead; demo targets are server-rendered by scope.
        try:
            await page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass

        html = await page.content()
        title = await page.title()
        shot = await page.screenshot(full_page=True) if screenshot else None

        return PageCapture(
            url=url,
            html=html,
            title=title,
            framework=_detect_framework(html),
            screenshot_png=shot,
        )
    finally:
        await context.close()


class BrowserSession:
    """Async context manager owning one Chromium instance.

    Launching Chromium is the slow part, so reuse one browser across every
    page in an audit and across the verification re-run.
    """

    def __init__(self, headless: bool = True) -> None:
        self._headless = headless
        self._pw = None
        self._browser: Browser | None = None

    async def __aenter__(self) -> Browser:
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=self._headless,
            # Required in Cloud Run: no shared memory device of useful size,
            # and no user namespace for the sandbox.
            args=["--disable-dev-shm-usage", "--no-sandbox"],
        )
        return self._browser

    async def __aexit__(self, *exc_info: object) -> None:
        if self._browser is not None:
            await self._browser.close()
        if self._pw is not None:
            await self._pw.stop()

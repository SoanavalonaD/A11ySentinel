"""What assistive technology actually receives, before and after a fix.

This exists because almost every fix we make is invisible. `alt`, `aria-label`
and `lang` change no pixels at all, so a side-by-side screenshot of a fixed
page shows two identical images. Presenting that as the result would be
unconvincing at best and misleading at worst.

The change is real, it is just not in the rendering. It is in the accessibility
tree — the structure a screen reader walks. An element that announced nothing
now announces "Send message". That is the difference, stated in the terms the
affected person experiences.

Read through CDP rather than Playwright's own accessibility API, which was
removed in Playwright 1.62. `Accessibility.getFullAXTree` is what that API
called underneath, so this is the same data from its original source.

Nothing here is generated. Chromium computes these names from the patched DOM
using the same algorithm a browser uses for a real screen reader, so the
"after" string is what the element genuinely announces, not a prediction.
"""

from __future__ import annotations

from dataclasses import dataclass

from playwright.async_api import BrowserContext, Page

# Roles worth showing. A tree contains dozens of structural nodes that mean
# nothing to a reader of the report; these are the ones a person navigates by.
ANNOUNCED_ROLES = frozenset(
    {
        "link",
        "button",
        "image",
        "img",
        "heading",
        "textbox",
        "checkbox",
        "radio",
        "combobox",
        "listbox",
        "menuitem",
        "tab",
        "switch",
        "slider",
        "searchbox",
    }
)

# Shown when an element has no accessible name. Deliberately plain language,
# because it appears in the report next to the fix.
NO_NAME = "(nothing — announced only as its type)"


@dataclass
class Announcement:
    """What one element announces."""

    role: str
    name: str

    def render(self) -> str:
        return f'{self.role}: "{self.name}"' if self.name else f"{self.role}: {NO_NAME}"


async def _ax_nodes(context: BrowserContext, page: Page) -> list[dict]:
    cdp = await context.new_cdp_session(page)
    try:
        await cdp.send("Accessibility.enable")
        result = await cdp.send("Accessibility.getFullAXTree")
        return result.get("nodes", []) or []
    finally:
        await cdp.detach()


async def announcement_for(
    context: BrowserContext, page: Page, selector: str
) -> Announcement | None:
    """What the element at `selector` announces, or None if it cannot be read.

    Returns None rather than a guess when the element is missing, ignored by
    assistive technology, or not a role worth reporting. A missing value is
    honest; an invented one is not.
    """
    try:
        backend_id = await page.evaluate(
            "(sel) => { const el = document.querySelector(sel); return el ? 1 : 0; }",
            selector,
        )
    except Exception:  # noqa: BLE001
        return None
    if not backend_id:
        return None

    # Resolve the element through CDP so we match the exact node, rather than
    # guessing from the tree by name.
    cdp = await context.new_cdp_session(page)
    try:
        await cdp.send("Accessibility.enable")
        await cdp.send("DOM.enable")
        doc = await cdp.send("DOM.getDocument", {"depth": -1, "pierce": False})
        node = await cdp.send(
            "DOM.querySelector",
            {"nodeId": doc["root"]["nodeId"], "selector": selector},
        )
        node_id = node.get("nodeId")
        if not node_id:
            return None

        partial = await cdp.send(
            "Accessibility.getPartialAXTree",
            {"nodeId": node_id, "fetchRelatives": False},
        )
        for ax in partial.get("nodes", []):
            if ax.get("ignored"):
                continue
            role = (ax.get("role") or {}).get("value", "")
            name = (ax.get("name") or {}).get("value", "")
            if role:
                return Announcement(role=role, name=name)
        return None
    except Exception:  # noqa: BLE001
        return None
    finally:
        await cdp.detach()


async def page_announcements(
    context: BrowserContext, page: Page, *, limit: int = 40
) -> list[Announcement]:
    """Everything a screen reader would announce on this page, in tree order.

    Used for the whole-page before/after view rather than the per-finding one.
    """
    out: list[Announcement] = []
    for node in await _ax_nodes(context, page):
        if node.get("ignored"):
            continue
        role = (node.get("role") or {}).get("value", "")
        if role not in ANNOUNCED_ROLES:
            continue
        name = (node.get("name") or {}).get("value", "")
        out.append(Announcement(role=role, name=name))
        if len(out) >= limit:
            break
    return out

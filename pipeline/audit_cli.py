"""Local entrypoint for a Stage 1 audit. No GCP required.

    python audit_cli.py https://example.com
    python audit_cli.py https://example.com --out result.json --show-browser

Output matches contracts/fixtures/audit-sample.json exactly, so it can be
dropped straight into the web layer as a fixture.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from a11ysentinel.models import Trigger
from a11ysentinel.orchestrator import run_audit


def _count(result, status: str) -> int:
    return sum(1 for f in result.findings if f.status.value == status)


def _summary(result) -> str:
    a = result.audit
    lines = [
        "",
        "=" * 62,
        f"  audit      {a.auditId}",
        f"  target     {a.targetUrl}",
        f"  status     {a.status.value}",
    ]
    if a.error:
        lines.append(f"  error      {a.error}")
    lines += [
        f"  pages      {a.pageCount}",
        "",
        f"  violations before   {a.violationsBefore}",
        f"  violations after    "
        f"{a.violationsAfter if a.violationsAfter is not None else 'pending'}",
        "",
        f"  findings            {len(result.findings)}",
        f"  candidates dropped  {len(result.discards)}",
        "",
        "  by lifecycle state:",
        f"    detected  {_count(result, 'detected')}"
        "   (real violation, no fix drafted)",
        f"    patched   {_count(result, 'patched')}"
        "   (fix drafted, not yet verified - never shown)",
        f"    verified  {_count(result, 'verified')}"
        "   (fix applied and re-checked with axe)",
        "=" * 62,
    ]

    if result.findings:
        lines.append("\n  Top findings by priority:\n")
        for f in result.findings[:8]:
            flag = "  [NEEDS HUMAN]" if f.requiresHumanInput else ""
            lines.append(f"   {f.triageRank:>2}. [{f.severity.value:<8}] {f.category}{flag}")
            lines.append(f"       {f.selector}")
            lines.append(f"       {f.userImpact}")
            lines.append("")

    if result.discards:
        lines.append("  Dropped candidates (reported, not hidden):\n")
        for d in result.discards[:10]:
            lines.append(f"    - {d}")
        if len(result.discards) > 10:
            lines.append(f"    ... and {len(result.discards) - 10} more")

    # Hard rule 1. This line ships in every surface, including the CLI.
    lines += [
        "",
        "  A11ySentinel finds, prioritises, drafts and verifies. It does not",
        "  make a site compliant. A human approves every change.",
        "",
    ]
    return "\n".join(lines)


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Run a Stage 1 accessibility audit.")
    parser.add_argument("url", help="Target page URL, scheme included.")
    parser.add_argument("--out", help="Write contract-shaped JSON to this path.")
    parser.add_argument(
        "--show-browser", action="store_true", help="Run Chromium headed, for debugging."
    )
    parser.add_argument(
        "--no-screenshot", action="store_true", help="Skip the screenshot capture."
    )
    parser.add_argument(
        "--prospect",
        action="store_true",
        help="Mark trigger as prospect rather than manual.",
    )
    args = parser.parse_args()

    if not args.url.startswith(("http://", "https://")):
        print("URL must include a scheme (https://).", file=sys.stderr)
        return 2

    result = await run_audit(
        args.url,
        trigger=Trigger.PROSPECT if args.prospect else Trigger.MANUAL,
        headless=not args.show_browser,
        screenshot=not args.no_screenshot,
    )

    print(_summary(result))

    if args.out:
        payload = result.to_contract_json()
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
        print(f"  Wrote {args.out}\n")

    return 0 if result.audit.status.value == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))

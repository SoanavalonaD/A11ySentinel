"""A11ySentinel pipeline.

Finds accessibility violations, prioritises them by user impact, drafts fixes,
and verifies them. A human approves every change.

We never claim a site is compliant. See CLAUDE.md, hard rule 1.
"""

__version__ = "0.1.0"

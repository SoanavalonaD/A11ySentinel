"""Typed models for the data contract.

`contracts/schema.md` is authoritative. This module is its Python expression —
if you change a field here, change it there first, and tell the partner.

The invariants in the contract are enforced in `Finding.validate_for_write`,
which is the only gate between a candidate finding and Firestore.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# Contract invariant 4. Also configurable via MIN_CONFIDENCE.
DEFAULT_MIN_CONFIDENCE = 0.7


class Severity(str, Enum):
    CRITICAL = "critical"
    SERIOUS = "serious"
    MODERATE = "moderate"
    MINOR = "minor"


class Source(str, Enum):
    AXE = "axe"
    VISUAL = "visual"


class Framework(str, Enum):
    REACT = "react"
    HTML = "html"
    UNKNOWN = "unknown"


class Trigger(str, Enum):
    MANUAL = "manual"
    PROSPECT = "prospect"


class AuditStatus(str, Enum):
    QUEUED = "queued"
    CAPTURING = "capturing"
    AUDITING = "auditing"
    COMPLETE = "complete"
    FAILED = "failed"


class EmailStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    SENT = "sent"


class FindingStatus(str, Enum):
    """Where a finding sits in its lifecycle.

    `verified` the boolean is about a patch. `status` is about the finding.
    Keeping them separate is what lets Stage 1 report real violations without
    ever implying a fix was checked.
    """

    # A real violation, no fix drafted. Safe to show as a finding.
    DETECTED = "detected"
    # A fix exists but has not survived verification. Never shown, never served.
    PATCHED = "patched"
    # Fix applied, axe re-run, original gone, nothing new. Safe to show as a fix.
    VERIFIED = "verified"


# Ordering used by the fallback triage sort, so agent 4 can ship as a plain
# sort if we run out of time on Sunday.
SEVERITY_ORDER: dict[Severity, int] = {
    Severity.CRITICAL: 0,
    Severity.SERIOUS: 1,
    Severity.MODERATE: 2,
    Severity.MINOR: 3,
}


class UnverifiedFindingError(Exception):
    """Raised when something tries to persist a finding that failed its gate.

    Hard rule 3: never ship an unverified patch. This is deliberately an
    exception rather than a silent filter — a caller that reaches this has a
    bug worth surfacing loudly.
    """


class Finding(BaseModel):
    """One accessibility violation. Maps to audits/{auditId}/findings/{findingId}."""

    findingId: str
    pageUrl: str
    source: Source
    category: str
    wcagCriterion: str
    rgaaCriterion: str | None = None
    severity: Severity
    userImpact: str
    evidence: str | None = None
    selector: str
    xpath: str | None = None
    currentCode: str
    patchedCode: str | None = None
    changeSummary: str | None = None
    requiresHumanInput: bool = False
    humanGuidance: str | None = None
    framework: Framework = Framework.UNKNOWN
    confidence: float = Field(ge=0.0, le=1.0)
    status: FindingStatus = FindingStatus.DETECTED
    verified: bool = False
    triageRank: int | None = None
    screenshotRef: str | None = None

    @model_validator(mode="after")
    def _human_guidance_pairs_with_flag(self) -> Finding:
        """Contract invariant 3, enforced at construction.

        Hard rule 5 depends on this reaching the UI: a finding that needs a
        human must carry the guidance explaining what the human has to supply.
        A flag with no guidance renders as a finished fix, which is exactly
        the failure mode we are trying to avoid.
        """
        if self.requiresHumanInput and not self.humanGuidance:
            raise ValueError(
                f"{self.findingId}: requiresHumanInput is set but humanGuidance "
                "is empty. A finding that needs a human must say what is needed."
            )
        if not self.requiresHumanInput and self.humanGuidance:
            raise ValueError(
                f"{self.findingId}: humanGuidance is set but requiresHumanInput "
                "is false. The UI keys off the flag, so the guidance would be lost."
            )
        return self

    @model_validator(mode="after")
    def _status_matches_patch_state(self) -> Finding:
        """Keep status, patchedCode and verified from drifting apart.

        The web layer branches on `status`. If it disagrees with the actual
        patch state we would show a fix that was never checked, which is the
        one failure mode this whole design exists to prevent.
        """
        if self.status is FindingStatus.DETECTED:
            if self.patchedCode is not None:
                raise ValueError(
                    f"{self.findingId}: status is 'detected' but patchedCode is "
                    "set. Move it to 'patched' once a fix is drafted."
                )
            if self.verified:
                raise ValueError(
                    f"{self.findingId}: status is 'detected' but verified is "
                    "true. Nothing has been verified — there is no patch."
                )
        else:
            if self.patchedCode is None:
                raise ValueError(
                    f"{self.findingId}: status is {self.status.value!r} but "
                    "patchedCode is null. Only 'detected' may lack a patch."
                )

        if self.verified is not (self.status is FindingStatus.VERIFIED):
            raise ValueError(
                f"{self.findingId}: verified={self.verified} contradicts "
                f"status={self.status.value!r}. Only the Verifier sets either."
            )
        return self

    def mark_patched(self, patched_code: str, change_summary: str | None = None) -> None:
        """Attach a drafted fix. Does not make any claim about it working."""
        self.patchedCode = patched_code
        self.changeSummary = change_summary
        self.status = FindingStatus.PATCHED
        self.verified = False

    def mark_verified(self) -> None:
        """Only the Verifier may call this, and only after re-running axe."""
        if self.patchedCode is None:
            raise UnverifiedFindingError(
                f"{self.findingId}: cannot verify a finding with no patch."
            )
        self.status = FindingStatus.VERIFIED
        self.verified = True

    def validate_for_write(self, min_confidence: float = DEFAULT_MIN_CONFIDENCE) -> None:
        """The gate between a candidate finding and Firestore.

        Raises UnverifiedFindingError if any contract invariant fails. Call
        this immediately before every write; do not filter silently.
        """
        if self.status is FindingStatus.PATCHED:
            raise UnverifiedFindingError(
                f"{self.findingId}: status is 'patched' — a fix was drafted but "
                "did not survive verification. Hard rule 3: an unverified fix "
                "never reaches the proxy or the report. Either verify it or "
                "drop the patch back to 'detected'."
            )
        if self.confidence < min_confidence:
            raise UnverifiedFindingError(
                f"{self.findingId}: confidence {self.confidence:.2f} is below "
                f"the {min_confidence} threshold (contract invariant 4)."
            )
        if not self.selector:
            raise UnverifiedFindingError(
                f"{self.findingId}: empty selector. Invariant 1 requires a "
                "selector that matches at least one element."
            )
        if self.source is Source.VISUAL and not self.evidence:
            raise UnverifiedFindingError(
                f"{self.findingId}: visual findings must carry evidence "
                "describing what the model saw."
            )

    def to_firestore(self) -> dict:
        """Plain dict for Firestore. Enums flattened, timestamps stay strings."""
        return self.model_dump(mode="json")


class Audit(BaseModel):
    """One audit run. Maps to audits/{auditId}."""

    auditId: str
    targetUrl: str
    trigger: Trigger = Trigger.MANUAL
    status: AuditStatus = AuditStatus.QUEUED
    createdAt: str
    completedAt: str | None = None
    pageCount: int = 0
    violationsBefore: int = 0
    # Null until verification completes. The UI renders this as "pending",
    # never as 0 — a premature 0 reads as "we fixed everything", which is
    # precisely the claim we must never make.
    violationsAfter: int | None = None
    proxyUrl: str | None = None
    emailStatus: EmailStatus = EmailStatus.DRAFT
    error: str | None = None

    def to_firestore(self) -> dict:
        return self.model_dump(mode="json")

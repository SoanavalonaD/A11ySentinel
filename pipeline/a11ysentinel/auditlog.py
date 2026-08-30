"""Structured decision trail for one audit run.

The pipeline already knew all of this — which agent acted, whether the outcome
was routine or a refusal, what stage it happened in — and then flattened it
into prose strings. The dashboard could show the sentence but not filter by
agent, colour by severity, or separate "we screened and found nothing" from
"we refused a patch".

So the same information is emitted twice: as `notes`, which stay human-readable
and are what a report quotes, and as `auditLogs`, which the UI can group and
filter. The strings are not parsed back into structure anywhere — both come
from the same call site, so they cannot drift.

Field names and the two unions match `web/src/types/schema.ts` exactly. This is
a contract, so it is written down rather than inferred.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

# Mirrors AgentName in the web schema. ProspectScout is agent 0 — it runs
# before the pipeline, producing the target the rest of them need.
AgentName = Literal[
    "ProspectScout",
    "RootOrchestrator",
    "RuleAuditor",
    "VisualAuditor",
    "TriageAgent",
    "RemediationFanOut",
    "Remediator",
    "Verifier",
    "OutreachDrafter",
]

# Mirrors LogLevel. `success` is deliberately distinct from `info`: a verified
# fix and a routine step are both non-failures, but only one is an achievement
# worth colouring differently.
LogLevel = Literal["info", "success", "warn", "error"]


@dataclass
class AuditLogEntry:
    """One thing an agent did, and how it went."""

    logId: str
    timestamp: str
    agentName: AgentName
    level: LogLevel
    message: str
    details: str | None = None
    stage: str | None = None

    def to_contract(self) -> dict:
        return {
            "logId": self.logId,
            "timestamp": self.timestamp,
            "agentName": self.agentName,
            "level": self.level,
            "message": self.message,
            "details": self.details,
            "stage": self.stage,
        }


@dataclass
class AuditLog:
    """Collector for one run. Ordered, and stable across a replay."""

    audit_id: str
    entries: list[AuditLogEntry] = field(default_factory=list)

    def record(
        self,
        agent: AgentName,
        level: LogLevel,
        message: str,
        *,
        details: str | None = None,
        stage: str | None = None,
    ) -> AuditLogEntry:
        entry = AuditLogEntry(
            # Sequential rather than random so the order is recoverable from
            # the id alone, and two runs of the same audit produce the same
            # ids — which matters when comparing a replay against a report.
            logId=f"log_{self.audit_id}_{len(self.entries) + 1:03d}",
            timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            agentName=agent,
            level=level,
            message=message,
            details=details,
            stage=stage,
        )
        self.entries.append(entry)
        return entry

    def to_contract(self) -> list[dict]:
        return [e.to_contract() for e in self.entries]

    @property
    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for e in self.entries:
            out[e.level] = out.get(e.level, 0) + 1
        return out

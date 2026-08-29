"""Firestore persistence. The pipeline writes; the web layer reads.

Every finding passes `validate_for_write` before it is persisted. That call is
not optional and not a filter — it raises, so a bug that would put an
unverified fix in front of a user fails loudly here rather than quietly
shipping.

Writes are idempotent on auditId, so a retried Cloud Run Job does not create
duplicate audits.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from google.cloud import firestore

from .models import Audit, Finding

AUDITS_COLLECTION = "audits"
FINDINGS_SUBCOLLECTION = "findings"

# Firestore caps a batch at 500 operations.
_BATCH_LIMIT = 450


@dataclass
class WriteReport:
    """What actually landed. Returned rather than logged so the caller can
    report honestly instead of assuming success."""

    audit_id: str
    findings_written: int
    findings_rejected: list[tuple[str, str]]

    def summary(self) -> str:
        line = f"{self.audit_id}: wrote {self.findings_written} findings"
        if self.findings_rejected:
            line += f", rejected {len(self.findings_rejected)}"
        return line


def get_client(project: str | None = None) -> firestore.Client:
    """Firestore client. Project comes from GOOGLE_CLOUD_PROJECT if unset."""
    project = project or os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT is not set. Copy .env.example to .env and "
            "fill it in, or pass project= explicitly."
        )
    database = os.getenv("FIRESTORE_DATABASE", "(default)")
    if database and database != "(default)":
        return firestore.Client(project=project, database=database)
    return firestore.Client(project=project)


def write_audit(client: firestore.Client, audit: Audit) -> None:
    """Upsert the audit document. Safe to call repeatedly as status advances."""
    client.collection(AUDITS_COLLECTION).document(audit.auditId).set(
        audit.to_firestore(), merge=True
    )


def write_findings(
    client: firestore.Client,
    audit_id: str,
    findings: list[Finding],
    *,
    min_confidence: float | None = None,
) -> WriteReport:
    """Persist findings, gating every one through the contract invariants.

    A finding that fails the gate is collected into the report rather than
    silently dropped — if we are discarding a third of our own output, that
    is something we need to see, not hide.
    """
    if min_confidence is None:
        min_confidence = float(os.getenv("MIN_CONFIDENCE", "0.7"))

    from .models import UnverifiedFindingError

    accepted: list[Finding] = []
    rejected: list[tuple[str, str]] = []

    for finding in findings:
        try:
            finding.validate_for_write(min_confidence=min_confidence)
            accepted.append(finding)
        except UnverifiedFindingError as exc:
            rejected.append((finding.findingId, str(exc)))

    parent = (
        client.collection(AUDITS_COLLECTION)
        .document(audit_id)
        .collection(FINDINGS_SUBCOLLECTION)
    )

    written = 0
    for start in range(0, len(accepted), _BATCH_LIMIT):
        batch = client.batch()
        for finding in accepted[start : start + _BATCH_LIMIT]:
            batch.set(parent.document(finding.findingId), finding.to_firestore())
        batch.commit()
        written += len(accepted[start : start + _BATCH_LIMIT])

    return WriteReport(
        audit_id=audit_id, findings_written=written, findings_rejected=rejected
    )


def persist(
    audit: Audit, findings: list[Finding], *, project: str | None = None
) -> WriteReport:
    """Write one complete audit. The single entry point used by the job."""
    client = get_client(project)
    write_audit(client, audit)
    return write_findings(client, audit.auditId, findings)

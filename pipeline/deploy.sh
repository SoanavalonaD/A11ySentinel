#!/usr/bin/env bash
# Deploy the pipeline to Cloud Run.
#
#   ./deploy.sh PROJECT_ID [REGION]
#
# Idempotent: safe to re-run. Enables the APIs it needs, builds with Cloud
# Build, and deploys. Run from the pipeline/ directory.

set -euo pipefail

PROJECT="${1:?usage: ./deploy.sh PROJECT_ID [REGION]}"
REGION="${2:-us-central1}"
SERVICE="a11ysentinel-pipeline"
BUCKET="${PROJECT}-a11ysentinel-artifacts"

echo "==> project ${PROJECT}, region ${REGION}"
gcloud config set project "${PROJECT}" >/dev/null

echo "==> enabling APIs (safe to re-run)"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  pubsub.googleapis.com \
  aiplatform.googleapis.com \
  --project "${PROJECT}"

echo "==> Firestore database (ignore the error if it already exists)"
gcloud firestore databases create --location="${REGION}" --project "${PROJECT}" || true

echo "==> artifacts bucket"
gcloud storage buckets create "gs://${BUCKET}" --location="${REGION}" \
  --project "${PROJECT}" 2>/dev/null || echo "    bucket already exists"

# Environment comes from env.deploy.yaml rather than --set-env-vars, because
# PROSPECT_POOL contains commas and comma is gcloud's delimiter for that flag.
# gcloud documents a "^@^" delimiter prefix as the workaround, but on Windows
# gcloud runs through cmd.exe, where "^" is itself the escape character, so the
# prefix never reaches gcloud. A file has no escaping rules at all.
# Edit env.deploy.yaml to change project, region, model or candidate pool.
echo "==> build and deploy"
# 2Gi because Chromium needs roughly 1.5Gi under load; 512Mi dies mid-audit
# with an opaque browser crash rather than a clean OOM.
gcloud run deploy "${SERVICE}" \
  --source . \
  --region "${REGION}" \
  --project "${PROJECT}" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --concurrency 1 \
  --max-instances 5 \
  --env-vars-file env.deploy.yaml \
  --allow-unauthenticated

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" \
  --project "${PROJECT}" --format 'value(status.url)')"

echo
echo "==> deployed: ${URL}"
echo
echo "    check readiness:"
echo "      curl ${URL}/health"
echo "      curl ${URL}/readyz"
echo
echo "    let the agent choose its own target and audit it:"
echo "      curl -X POST ${URL}/prospect -H 'Content-Type: application/json' -d '{}'"
echo
echo "    run an audit against a URL you name:"
echo "      curl -X POST ${URL}/audit -H 'Content-Type: application/json' \\"
echo "        -d '{\"url\":\"https://www.w3.org/WAI/demos/bad/before/home.html\"}'"

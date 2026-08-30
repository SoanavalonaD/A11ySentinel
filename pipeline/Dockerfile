# Playwright's own image, pinned to the same version as requirements.txt.
# Building Chromium's system dependencies by hand on a slim base is a known
# time sink, and the browser must match the Python client version or launch
# fails at runtime rather than at build time.
FROM mcr.microsoft.com/playwright/python:v1.62.0-noble

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Cloud Run gives the container a read-only-ish home; keep browsers where
    # the base image already put them.
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Dependencies first so a code change does not invalidate the layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY a11ysentinel/ ./a11ysentinel/
COPY vendor/ ./vendor/
# The demo target, served at /demo. Outreach guard 3 requires the video to run
# against a domain we control, and shipping it in the image means the demo has
# no separate host that can be down on Monday.
COPY demo-site/ ./demo-site/
# The built dashboard, produced by deploy.sh before the image is built. Served
# at / by the same service, so the browser talks to /audit on its own origin
# and CORS never enters the picture. Optional: the API runs fine without it.
COPY web-dist/ ./web-dist/
COPY service.py audit_cli.py ./

# Run as the non-root user the Playwright image already provides.
USER pwuser

# Cloud Run sets PORT. Default is for local `docker run`.
ENV PORT=8080
EXPOSE 8080

# One worker: each audit drives a Chromium instance, so concurrency is bounded
# by memory, not by CPU. Scale with Cloud Run instances instead of workers.
CMD exec uvicorn service:app --host 0.0.0.0 --port ${PORT} --workers 1

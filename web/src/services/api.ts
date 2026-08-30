import { AuditResultResponse } from '../types/schema';

export interface AuditRequestPayload {
  url: string;
  trigger?: 'manual' | 'prospect';
  visual?: boolean;
  remediate?: boolean;
  modelTriage?: boolean;
  draftEmail?: boolean;
}

/**
 * Where the pipeline lives. Defaults to the deployed Cloud Run service;
 * point it at a local `uvicorn service:app` with VITE_API_BASE_URL to audit
 * without deploying.
 *
 * Whichever it is, the service must allow this page's origin (ALLOWED_ORIGINS
 * on the pipeline) or the browser blocks the request before it is sent.
 */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://a11ysentinel-pipeline-708226575684.us-central1.run.app';

/**
 * A request that did not produce an audit. Carries why, so the dashboard can
 * say what happened instead of guessing.
 */
export class AuditRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'AuditRequestError';
    this.status = status;
  }
}

/**
 * Runs an audit against the pipeline.
 *
 * **This never invents a result.** It used to: every failure — an unreachable
 * backend, a CORS-blocked preflight, an HTTP 500, a URL that does not resolve
 * — was caught and answered with `generateCustomMockResponse()`, a hardcoded
 * audit reporting `status: 'complete'`, 18 violations reduced to 2, four
 * fabricated findings and invented agent logs claiming axe-core had run.
 *
 * The only thing that varied with the URL was the URL echoed back, so every
 * audit produced the same confident numbers whatever was typed, including for
 * addresses that do not exist. On a tool whose entire premise is that it
 * reports measurements rather than claims, a fabricated measurement is the
 * one output it must never produce.
 *
 * A failure now throws. The caller renders it as a failed audit.
 */
export async function runAuditApi(payload: AuditRequestPayload): Promise<AuditResultResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: payload.url,
        trigger: payload.trigger || 'manual',
        remediate: payload.remediate ?? true,
        remediationLimit: 5,
        modelTriage: payload.modelTriage ?? true,
        visual: payload.visual ?? true,
        draftEmail: payload.draftEmail ?? true,
      }),
    });
  } catch (error) {
    // fetch() rejects for network failures and for a blocked CORS preflight,
    // and the browser deliberately does not say which. Name both.
    throw new AuditRequestError(
      `Could not reach the pipeline at ${API_BASE_URL}. The service may be ` +
        `down, or the browser may have blocked the request because the ` +
        `service did not allow this origin (CORS). ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    // The pipeline reports a bad target as a 4xx and its own trouble as a 5xx.
    // Surface its explanation rather than a generic failure.
    let detail = '';
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body?.detail ?? '');
    } catch {
      detail = await response.text().catch(() => '');
    }

    throw new AuditRequestError(
      `The pipeline refused the audit (HTTP ${response.status})` +
        `${detail ? `: ${detail}` : '.'}`,
      response.status,
    );
  }

  const data = await response.json();

  // A 200 carrying the wrong shape is still not an audit.
  if (!data || typeof data !== 'object' || !data.audit || !Array.isArray(data.findings)) {
    throw new AuditRequestError(
      'The pipeline returned a response that is not an audit result.',
      response.status,
    );
  }

  return data as AuditResultResponse;
}

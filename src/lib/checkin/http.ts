import { NextResponse } from 'next/server';
import {
  CHECKIN_ERROR_MESSAGES,
  CHECKIN_HTTP_STATUS,
  type CheckinErrorCode,
  type CheckinErrorDetails,
} from './errors';

/** Las respuestas de check-in reflejan estado en vivo: nunca se cachean. */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function checkinJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function checkinError(code: CheckinErrorCode, details?: CheckinErrorDetails) {
  return checkinJson(
    {
      ok: false,
      error: { code, message: CHECKIN_ERROR_MESSAGES[code], ...(details && { details }) },
    },
    CHECKIN_HTTP_STATUS[code]
  );
}

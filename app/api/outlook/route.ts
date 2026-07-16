import { NextResponse } from "next/server";
import {
  HONG_KONG_WIDE,
  isDistrictId,
  type LocationId,
} from "@/lib/location/districts";
import { buildOutlookPayload } from "@/lib/outlook/aggregate";

export const dynamic = "force-dynamic";

function parseLocation(value: string | null): LocationId | null {
  if (value === null || value === HONG_KONG_WIDE.id) return HONG_KONG_WIDE.id;
  return isDistrictId(value) ? value : null;
}

export async function GET(request: Request) {
  const locationId = parseLocation(new URL(request.url).searchParams.get("location"));

  if (!locationId) {
    return NextResponse.json(
      { error: "地區參數無效。" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const payload = await buildOutlookPayload(locationId);
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

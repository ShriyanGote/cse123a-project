import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { device_id, weight_g, battery_mv } = body ?? {};

  if (!device_id || typeof weight_g !== "number") {
    return NextResponse.json(
      { error: "device_id and numeric weight_g required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("water_readings").insert([
    {
      device_id,
      weight_g,
      battery_mv: typeof battery_mv === "number" ? battery_mv : null,
    },
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}

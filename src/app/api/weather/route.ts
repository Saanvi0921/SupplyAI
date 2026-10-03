import { NextRequest, NextResponse } from "next/server";
import { getWeatherRisk } from "@/services/weather";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        {
          error: "Valid lat and lon parameters are required.",
        },
        { status: 400 }
      );
    }

    const weather = await getWeatherRisk(lat, lon);

    return NextResponse.json({
      success: true,
      weather,
    });
  } catch (error) {
    console.error("Weather API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve weather data.",
      },
      { status: 500 }
    );
  }
}
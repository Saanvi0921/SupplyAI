import { NextRequest, NextResponse } from "next/server";
import { getJourneyWeatherRisk } from "@/services/weather";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const originLat = Number(searchParams.get("originLat"));
    const originLon = Number(searchParams.get("originLon"));
    const destinationLat = Number(searchParams.get("destinationLat"));
    const destinationLon = Number(searchParams.get("destinationLon"));

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLon) ||
      !Number.isFinite(destinationLat) ||
      !Number.isFinite(destinationLon)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid origin and destination coordinates are required.",
        },
        { status: 400 }
      );
    }

    const weather = await getJourneyWeatherRisk(
      [originLat, originLon],
      [destinationLat, destinationLon],
      7
    );

    return NextResponse.json({
      success: true,
      weather,
    });
  } catch (error) {
    console.error("Journey weather API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve journey weather data.",
      },
      { status: 500 }
    );
  }
}
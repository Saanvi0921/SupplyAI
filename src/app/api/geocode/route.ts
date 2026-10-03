import { NextRequest, NextResponse } from "next/server";
import { geocodeLocation } from "@/services/geocoding";

export async function GET(request: NextRequest) {
  try {
    const location = request.nextUrl.searchParams.get("location");

    if (!location) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing location parameter.",
        },
        { status: 400 }
      );
    }

    const result = await geocodeLocation(location);

    return NextResponse.json({
      success: true,
      location: result,
    });
  } catch (error) {
    console.error("Geocoding API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to geocode location.",
      },
      { status: 500 }
    );
  }
}
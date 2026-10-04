import { NextRequest, NextResponse } from "next/server";

type OSRMResponse = {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
      type: string;
    };
  }[];
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const startLat = Number(
      searchParams.get("startLat")
    );

    const startLon = Number(
      searchParams.get("startLon")
    );

    const endLat = Number(
      searchParams.get("endLat")
    );

    const endLon = Number(
      searchParams.get("endLon")
    );

    if (
      !Number.isFinite(startLat) ||
      !Number.isFinite(startLon) ||
      !Number.isFinite(endLat) ||
      !Number.isFinite(endLon)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Valid startLat, startLon, endLat, and endLon are required.",
        },
        {
          status: 400,
        }
      );
    }

    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${startLon},${startLat};${endLon},${endLat}` +
      `?overview=full&geometries=geojson`;

    const response = await fetch(osrmUrl, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Routing service returned ${response.status}.`
      );
    }

    const data =
      (await response.json()) as OSRMResponse;

    if (
      data.code !== "Ok" ||
      !data.routes ||
      data.routes.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No valid ground route could be found.",
        },
        {
          status: 404,
        }
      );
    }

    const route = data.routes[0];

    /*
     * GeoJSON coordinates come back as:
     *
     * [longitude, latitude]
     *
     * Leaflet expects:
     *
     * [latitude, longitude]
     *
     * So we reverse them here.
     */
    const coordinates: [number, number][] =
      route.geometry.coordinates.map(
        ([longitude, latitude]) => [
          latitude,
          longitude,
        ]
      );

    return NextResponse.json({
      success: true,

      route: {
        coordinates,

        distanceKm:
          Math.round(
            (route.distance / 1000) * 10
          ) / 10,

        durationHours:
          Math.round(
            (route.duration / 3600) * 10
          ) / 10,
      },
    });
  } catch (error) {
    console.error(
      "Routing API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to calculate route.",
      },
      {
        status: 500,
      }
    );
  }
}
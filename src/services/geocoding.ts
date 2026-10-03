export type GeocodedLocation = {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

export async function geocodeLocation(
  query: string
): Promise<GeocodedLocation> {
  const cleanedQuery = query.trim();

  if (!cleanedQuery) {
    throw new Error("Location cannot be empty.");
  }

  const params = new URLSearchParams({
    q: cleanedQuery,
    format: "json",
    limit: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "SupplyAI-Hackathon-Demo",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Geocoding request failed with status ${response.status}.`
    );
  }

  const results = (await response.json()) as NominatimResult[];

  if (results.length === 0) {
    throw new Error(`Could not find location: ${cleanedQuery}`);
  }

  const result = results[0];

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`Invalid coordinates returned for ${cleanedQuery}.`);
  }

  return {
    name: cleanedQuery,
    displayName: result.display_name,
    latitude,
    longitude,
  };
}
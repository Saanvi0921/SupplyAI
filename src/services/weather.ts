export type WeatherRiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type WeatherResult = {
  latitude: number;
  longitude: number;
  temperature: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
  riskLevel: WeatherRiskLevel;
  riskScore: number;
  summary: string;
};

export type JourneyWeatherPoint =
  WeatherResult & {
    pointNumber: number;
    progressPercent: number;
  };

export type JourneyWeatherResult = {
  riskLevel: WeatherRiskLevel;
  riskScore: number;
  averageRiskScore: number;
  highestRiskScore: number;
  highestRiskPoint: JourneyWeatherPoint;
  points: JourneyWeatherPoint[];
  summary: string;
};

type Coordinate = [number, number];

function getRiskLevel(
  riskScore: number
): WeatherRiskLevel {
  if (riskScore >= 50) {
    return "HIGH";
  }

  if (riskScore >= 20) {
    return "MEDIUM";
  }

  return "LOW";
}

function calculateWeatherRisk(
  precipitation: number,
  windSpeed: number,
  weatherCode: number
): {
  riskLevel: WeatherRiskLevel;
  riskScore: number;
  summary: string;
} {
  let riskScore = 0;

  const reasons: string[] = [];

  // -------------------------
  // PRECIPITATION RISK
  // -------------------------

  if (precipitation >= 10) {
    riskScore += 30;

    reasons.push(
      "heavy precipitation"
    );
  } else if (
    precipitation >= 2
  ) {
    riskScore += 15;

    reasons.push(
      "moderate precipitation"
    );
  }

  // -------------------------
  // WIND RISK
  // -------------------------

  if (windSpeed >= 60) {
    riskScore += 40;

    reasons.push(
      "dangerous winds"
    );
  } else if (
    windSpeed >= 35
  ) {
    riskScore += 25;

    reasons.push(
      "strong winds"
    );
  } else if (
    windSpeed >= 20
  ) {
    riskScore += 10;

    reasons.push(
      "elevated winds"
    );
  }

  // -------------------------
  // THUNDERSTORM RISK
  // -------------------------

  if (
    [95, 96, 99].includes(
      weatherCode
    )
  ) {
    riskScore += 40;

    reasons.push(
      "thunderstorm conditions"
    );
  }

  // -------------------------
  // SNOW / ICE RISK
  // -------------------------

  if (
    [
      71,
      73,
      75,
      77,
      85,
      86,
    ].includes(weatherCode)
  ) {
    riskScore += 25;

    reasons.push(
      "snow conditions"
    );
  }

  // -------------------------
  // FREEZING PRECIPITATION
  // -------------------------

  if (
    [56, 57, 66, 67].includes(
      weatherCode
    )
  ) {
    riskScore += 35;

    reasons.push(
      "freezing precipitation"
    );
  }

  // -------------------------
  // FOG / LOW VISIBILITY
  // -------------------------

  if (
    [45, 48].includes(
      weatherCode
    )
  ) {
    riskScore += 15;

    reasons.push(
      "reduced visibility"
    );
  }

  riskScore = Math.min(
    riskScore,
    100
  );

  const riskLevel =
    getRiskLevel(riskScore);

  const summary =
    reasons.length === 0
      ? "No significant weather disruption detected."
      : `Potential disruption from ${reasons.join(
          ", "
        )}.`;

  return {
    riskLevel,
    riskScore,
    summary,
  };
}

/*
 * Fetch live weather risk for ONE
 * coordinate.
 *
 * Keeping this function means your
 * existing app code will continue
 * working while we add journey-wide
 * analysis.
 */
export async function getWeatherRisk(
  latitude: number,
  longitude: number
): Promise<WeatherResult> {
  const params =
    new URLSearchParams({
      latitude:
        latitude.toString(),

      longitude:
        longitude.toString(),

      current:
        "temperature_2m,precipitation,weather_code,wind_speed_10m",

      wind_speed_unit: "kmh",
    });

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      "Unable to retrieve weather data."
    );
  }

  const data =
    await response.json();

  const temperature =
    data.current
      ?.temperature_2m ?? 0;

  const precipitation =
    data.current
      ?.precipitation ?? 0;

  const windSpeed =
    data.current
      ?.wind_speed_10m ?? 0;

  const weatherCode =
    data.current
      ?.weather_code ?? 0;

  const risk =
    calculateWeatherRisk(
      precipitation,
      windSpeed,
      weatherCode
    );

  return {
    latitude,
    longitude,
    temperature,
    precipitation,
    windSpeed,
    weatherCode,
    riskLevel:
      risk.riskLevel,
    riskScore:
      risk.riskScore,
    summary:
      risk.summary,
  };
}

/*
 * Creates evenly spaced sample
 * coordinates between the shipment
 * origin and destination.
 *
 * For the hackathon demo we use
 * several checkpoints rather than
 * calling the weather API for every
 * single map coordinate.
 */
function createJourneyPoints(
  origin: Coordinate,
  destination: Coordinate,
  numberOfPoints = 7
): Coordinate[] {
  const points: Coordinate[] =
    [];

  /*
   * Adjust longitude so routes
   * crossing the International
   * Date Line travel across the
   * Pacific instead of across
   * the entire map.
   */
  let destinationLongitude =
    destination[1];

  const longitudeDifference =
    destinationLongitude -
    origin[1];

  if (
    longitudeDifference > 180
  ) {
    destinationLongitude -= 360;
  } else if (
    longitudeDifference < -180
  ) {
    destinationLongitude += 360;
  }

  for (
    let index = 0;
    index < numberOfPoints;
    index++
  ) {
    const progress =
      index /
      (numberOfPoints - 1);

    const latitude =
      origin[0] +
      (destination[0] -
        origin[0]) *
        progress;

    let longitude =
      origin[1] +
      (destinationLongitude -
        origin[1]) *
        progress;

    if (longitude > 180) {
      longitude -= 360;
    }

    if (longitude < -180) {
      longitude += 360;
    }

    points.push([
      latitude,
      longitude,
    ]);
  }

  return points;
}

/*
 * Analyze weather across the
 * ENTIRE shipment journey.
 *
 * Default:
 * 7 checkpoints from origin
 * to destination.
 */
export async function getJourneyWeatherRisk(
  origin: Coordinate,
  destination: Coordinate,
  numberOfPoints = 7
): Promise<JourneyWeatherResult> {
  const safePointCount =
    Math.max(
      3,
      Math.min(
        numberOfPoints,
        10
      )
    );

  const coordinates =
    createJourneyPoints(
      origin,
      destination,
      safePointCount
    );

  /*
   * Fetch all checkpoint weather
   * simultaneously so the user
   * does not wait for one request
   * after another.
   */
  const weatherResults =
    await Promise.all(
      coordinates.map(
        async (
          coordinate,
          index
        ) => {
          const weather =
            await getWeatherRisk(
              coordinate[0],
              coordinate[1]
            );

          const progressPercent =
            Math.round(
              (index /
                (coordinates.length -
                  1)) *
                100
            );

          const point:
            JourneyWeatherPoint =
            {
              ...weather,

              pointNumber:
                index + 1,

              progressPercent,
            };

          return point;
        }
      )
    );

  const averageRiskScore =
    Math.round(
      weatherResults.reduce(
        (total, point) =>
          total +
          point.riskScore,
        0
      ) /
        weatherResults.length
    );

  const highestRiskPoint =
    weatherResults.reduce(
      (highest, point) =>
        point.riskScore >
        highest.riskScore
          ? point
          : highest
    );

  const highestRiskScore =
    highestRiskPoint.riskScore;

  /*
   * Journey score combines:
   *
   * 60% highest-risk checkpoint
   * 40% average route risk
   *
   * This prevents one dangerous
   * section of the route from being
   * hidden by several calm sections.
   */
  const riskScore =
    Math.min(
      100,
      Math.round(
        highestRiskScore *
          0.6 +
          averageRiskScore *
            0.4
      )
    );

  const riskLevel =
    getRiskLevel(riskScore);

  let summary =
    "Weather conditions are generally stable across the shipment journey.";

  if (
    highestRiskScore >= 50
  ) {
    summary =
      `High weather exposure detected near ${highestRiskPoint.progressPercent}% of the journey. ` +
      highestRiskPoint.summary;
  } else if (
    highestRiskScore >= 20
  ) {
    summary =
      `Elevated weather conditions detected near ${highestRiskPoint.progressPercent}% of the journey. ` +
      highestRiskPoint.summary;
  }

  return {
    riskLevel,
    riskScore,
    averageRiskScore,
    highestRiskScore,
    highestRiskPoint,
    points:
      weatherResults,
    summary,
  };
}
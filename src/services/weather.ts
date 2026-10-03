export type WeatherRiskLevel = "LOW" | "MEDIUM" | "HIGH";

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

  // Rain / precipitation risk
  if (precipitation >= 10) {
    riskScore += 30;
    reasons.push("heavy precipitation");
  } else if (precipitation >= 2) {
    riskScore += 15;
    reasons.push("moderate precipitation");
  }

  // Wind risk
  if (windSpeed >= 60) {
    riskScore += 40;
    reasons.push("dangerous winds");
  } else if (windSpeed >= 35) {
    riskScore += 25;
    reasons.push("strong winds");
  } else if (windSpeed >= 20) {
    riskScore += 10;
    reasons.push("elevated winds");
  }

  // Open-Meteo severe weather codes
  if ([95, 96, 99].includes(weatherCode)) {
    riskScore += 40;
    reasons.push("thunderstorm conditions");
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    riskScore += 25;
    reasons.push("snow conditions");
  }

  riskScore = Math.min(riskScore, 100);

  let riskLevel: WeatherRiskLevel = "LOW";

  if (riskScore >= 50) {
    riskLevel = "HIGH";
  } else if (riskScore >= 20) {
    riskLevel = "MEDIUM";
  }

  const summary =
    reasons.length === 0
      ? "No significant weather disruption detected."
      : `Potential disruption from ${reasons.join(", ")}.`;

  return {
    riskLevel,
    riskScore,
    summary,
  };
}

export async function getWeatherRisk(
  latitude: number,
  longitude: number
): Promise<WeatherResult> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
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
    throw new Error("Unable to retrieve weather data.");
  }

  const data = await response.json();

  const temperature = data.current.temperature_2m ?? 0;
  const precipitation = data.current.precipitation ?? 0;
  const windSpeed = data.current.wind_speed_10m ?? 0;
  const weatherCode = data.current.weather_code ?? 0;

  const risk = calculateWeatherRisk(
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
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore,
    summary: risk.summary,
  };
}
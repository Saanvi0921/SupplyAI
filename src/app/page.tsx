"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

const SupplyMap = dynamic(() => import("@/components/SupplyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[590px] w-full items-center justify-center bg-[#e8e7e1]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        Loading route intelligence...
      </p>
    </div>
  ),
});

type WeatherResult = {
  latitude: number;
  longitude: number;
  temperature: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number;
  summary: string;
};

type GeocodedLocation = {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
};

type TransportMode =
  | "Ocean"
  | "Air"
  | "Ground"
  | "Multimodal";

type ShipmentEstimate = {
  directDistanceKm: number;
  modeledDistanceKm: number;
  etaDays: number;
  estimatedCost: number;
  overallRisk: number;
  status: "ON TRACK" | "MONITOR" | "INTERVENTION";
};

type AlternativeOption = {
  name: string;
  description: string;
  modes: TransportMode[];
  etaDays: number;
  cost: number;
  risk: number;
  score?: number;
};

type PanelName =
  | "shipment"
  | "risk"
  | "alternatives"
  | "activity";

const COST_REVIEW_THRESHOLD = 12000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  origin: GeocodedLocation,
  destination: GeocodedLocation
) {
  const earthRadiusKm = 6371;

  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);

  const deltaLat = toRadians(
    destination.latitude - origin.latitude
  );

  const deltaLon = toRadians(
    destination.longitude - origin.longitude
  );

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
}

function calculateShipmentEstimate(
  origin: GeocodedLocation,
  destination: GeocodedLocation,
  transport: string,
  weatherRisk: number,
  disruptionActive: boolean
): ShipmentEstimate {
  const directDistanceKm = calculateDistanceKm(
    origin,
    destination
  );

  const profiles = {
    Ocean: {
      routeFactor: 1.15,
      kmPerDay: 650,
      handlingDays: 4,
      baseCost: 1800,
      costPerKm: 0.65,
      baseRisk: 18,
    },
    Air: {
      routeFactor: 1.05,
      kmPerDay: 4500,
      handlingDays: 1,
      baseCost: 2800,
      costPerKm: 1.35,
      baseRisk: 12,
    },
    Ground: {
      routeFactor: 1.15,
      kmPerDay: 650,
      handlingDays: 1,
      baseCost: 900,
      costPerKm: 0.8,
      baseRisk: 15,
    },
  };

  const mode: "Ocean" | "Air" | "Ground" =
    transport === "Air"
      ? "Air"
      : transport === "Ground"
        ? "Ground"
        : "Ocean";

  const profile = profiles[mode];

  const modeledDistanceKm =
    directDistanceKm * profile.routeFactor;

  const weatherDelayDays =
    weatherRisk >= 70
      ? 3
      : weatherRisk >= 40
        ? 2
        : weatherRisk >= 20
          ? 1
          : 0;

  let etaDays =
    Math.ceil(
      modeledDistanceKm / profile.kmPerDay
    ) +
    profile.handlingDays +
    weatherDelayDays;

  let estimatedCost =
    profile.baseCost +
    modeledDistanceKm * profile.costPerKm;

  estimatedCost *=
    1 + (weatherRisk / 100) * 0.15;

  let overallRisk = Math.min(
    100,
    Math.round(
      profile.baseRisk + weatherRisk * 0.65
    )
  );

  if (disruptionActive) {
    etaDays += 5;
    estimatedCost *= 1.25;

    overallRisk = Math.min(
      100,
      Math.max(72, overallRisk + 50)
    );
  }

  estimatedCost =
    Math.round(estimatedCost / 10) * 10;

  const status =
    overallRisk >= 70
      ? "INTERVENTION"
      : overallRisk >= 40
        ? "MONITOR"
        : "ON TRACK";

  return {
    directDistanceKm,
    modeledDistanceKm,
    etaDays,
    estimatedCost,
    overallRisk,
    status,
  };
}

function calculateAlternativeOptions(
  origin: GeocodedLocation,
  destination: GeocodedLocation,
  weatherRisk: number,
  disruptionActive: boolean
): AlternativeOption[] {
  const distance = calculateDistanceKm(
    origin,
    destination
  );

  const ground = calculateShipmentEstimate(
    origin,
    destination,
    "Ground",
    weatherRisk,
    false
  );

  const ocean = calculateShipmentEstimate(
    origin,
    destination,
    "Ocean",
    weatherRisk,
    false
  );

  const air = calculateShipmentEstimate(
    origin,
    destination,
    "Air",
    weatherRisk,
    false
  );

  const options: AlternativeOption[] = [];

  /*
   * SHORT / REGIONAL
   *
   * Ground is normally the most sensible option
   * when the shipment is relatively close.
   */
  if (distance <= 5000) {
    options.push({
      name: "Ground Direct",
      description:
        "Direct road freight with minimal transfers",
      modes: ["Ground"],
      etaDays: ground.etaDays,
      cost: ground.estimatedCost,
      risk: ground.overallRisk,
    });

    /*
     * Ground + Air is useful for longer regional
     * shipments where speed matters.
     */
    if (distance >= 500) {
      options.push({
        name: "Ground + Air",
        description:
          "Road transfer with expedited air freight",
        modes: ["Ground", "Air"],
        etaDays: Math.max(
          2,
          Math.ceil(air.etaDays + 1)
        ),
        cost:
          Math.round(
            (air.estimatedCost * 1.08) / 10
          ) * 10,
        risk: Math.min(
          100,
          Math.round(
            air.overallRisk + 3
          )
        ),
      });
    }
  }

  /*
   * LONG-DISTANCE / INTERNATIONAL
   *
   * Ocean and Air become valid options.
   */
  if (distance >= 300) {
    options.push({
      name: "Ground + Ocean",
      description:
        "Road transfers connected by ocean freight",
      modes: ["Ground", "Ocean"],
      etaDays:
        ocean.etaDays +
        (disruptionActive ? 4 : 0),
      cost:
        Math.round(
          (ocean.estimatedCost *
            (disruptionActive ? 1.18 : 1)) /
          10
        ) * 10,
      risk: disruptionActive
        ? Math.min(
          100,
          ocean.overallRisk + 35
        )
        : ocean.overallRisk,
    });

    options.push({
      name: "Ground + Air",
      description:
        "Road transfers connected by air freight",
      modes: ["Ground", "Air"],
      etaDays: air.etaDays,
      cost: air.estimatedCost,
      risk: Math.max(
        8,
        air.overallRisk -
        (disruptionActive ? 2 : 0)
      ),
    });
  }

  /*
   * ADAPTIVE THREE-MODE OPTION
   *
   * Only offer this on very long routes.
   * It can use Ground + Ocean + Air.
   */
  if (distance >= 5000) {
    const multimodalEta = Math.max(
      air.etaDays + 2,
      Math.round(
        ocean.etaDays * 0.55 +
        air.etaDays * 0.45
      )
    );

    const multimodalCost =
      Math.round(
        ((ocean.estimatedCost * 0.55 +
          air.estimatedCost * 0.45 +
          900) *
          (disruptionActive ? 1.05 : 1)) /
        10
      ) * 10;

    const multimodalRisk = Math.max(
      8,
      Math.round(
        ocean.overallRisk * 0.4 +
        air.overallRisk * 0.4 +
        12
      )
    );

    options.push({
      name: "Adaptive Multimodal",
      description:
        "Ground, ocean, and air segments balanced for cost, time, and risk",
      modes: [
        "Ground",
        "Ocean",
        "Air",
      ],
      etaDays: multimodalEta,
      cost: multimodalCost,
      risk: multimodalRisk,
    });
  }

  return options;
}

function chooseRecommendedOption(
  options: AlternativeOption[],
  disruptionActive: boolean
) {
  if (options.length === 0) {
    throw new Error(
      "No feasible shipment options were generated."
    );
  }

  const minCost = Math.min(
    ...options.map((option) => option.cost)
  );

  const maxCost = Math.max(
    ...options.map((option) => option.cost)
  );

  const minEta = Math.min(
    ...options.map((option) => option.etaDays)
  );

  const maxEta = Math.max(
    ...options.map((option) => option.etaDays)
  );

  const minRisk = Math.min(
    ...options.map((option) => option.risk)
  );

  const maxRisk = Math.max(
    ...options.map((option) => option.risk)
  );

  function normalize(
    value: number,
    min: number,
    max: number
  ) {
    if (max === min) {
      return 0;
    }

    return (value - min) / (max - min);
  }

  const costWeight = disruptionActive
    ? 0.25
    : 0.4;

  const timeWeight = disruptionActive
    ? 0.3
    : 0.35;

  const riskWeight = disruptionActive
    ? 0.45
    : 0.25;

  const scoredOptions = options.map(
    (option) => {
      const costScore = normalize(
        option.cost,
        minCost,
        maxCost
      );

      const timeScore = normalize(
        option.etaDays,
        minEta,
        maxEta
      );

      const riskScore = normalize(
        option.risk,
        minRisk,
        maxRisk
      );

      const score =
        costScore * costWeight +
        timeScore * timeWeight +
        riskScore * riskWeight;

      return {
        ...option,
        score,
      };
    }
  );

  return scoredOptions.reduce(
    (best, current) =>
      (current.score ?? 1) <
        (best.score ?? 1)
        ? current
        : best
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDistance(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function riskColor(risk: number) {
  if (risk >= 60) return "text-red-600";
  if (risk >= 30) return "text-amber-600";
  return "text-emerald-600";
}

const Stat = ({
  label,
  value,
  subtext,
  warning = false,
}: {
  label: string;
  value: string;
  subtext: string;
  warning?: boolean;
}) => (
  <div className="border-r border-slate-200 px-5 last:border-r-0">
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
      {label}
    </p>

    <div className="mt-2 flex items-baseline gap-2">
      <span
        className={`text-2xl font-semibold tracking-tight ${warning
          ? "text-amber-600"
          : "text-slate-950"
          }`}
      >
        {value}
      </span>
    </div>

    <p className="mt-1 text-xs text-slate-500">
      {subtext}
    </p>
  </div>
);

function RiskIntelligenceView({
  overallRisk,
  weatherRisk,
  cargo,
  transport,
  disrupted,
  recommendation,
}: {
  overallRisk: number;
  weatherRisk: number;
  cargo: string;
  transport: string;
  disrupted: boolean;
  recommendation: string;
}) {
  const routeRisk = disrupted
    ? 78
    : Math.min(
      100,
      Math.max(12, overallRisk)
    );

  const cargoLower = cargo.toLowerCase();

  const cargoRisk =
    cargoLower.includes("electronics") ||
      cargoLower.includes("medical") ||
      cargoLower.includes("pharma")
      ? 24
      : cargoLower.includes("food") ||
        cargoLower.includes("perishable")
        ? 32
        : 16;

  const operationalRisk = disrupted
    ? 68
    : transport === "Ocean"
      ? 16
      : transport === "Air"
        ? 12
        : 18;

  const riskItems = [
    {
      label: "Weather Risk",
      value: weatherRisk,
      description:
        "Live conditions at shipment origin",
    },
    {
      label: "Route Risk",
      value: routeRisk,
      description: disrupted
        ? "Active disruption affecting current routing"
        : "Distance and transport-mode exposure",
    },
    {
      label: "Cargo Risk",
      value: cargoRisk,
      description: cargo,
    },
    {
      label: "Operational Risk",
      value: operationalRisk,
      description: disrupted
        ? "Elevated handling and transit complexity"
        : "Handling and transit complexity",
    },
  ];

  function labelForRisk(value: number) {
    if (value >= 70) return "CRITICAL";
    if (value >= 40) return "HIGH";
    if (value >= 20) return "MODERATE";
    return "LOW";
  }

  function colorForRisk(value: number) {
    if (value >= 70) {
      return {
        text: "text-red-600",
        bar: "bg-red-600",
        background: "bg-red-50",
        border: "border-red-200",
      };
    }

    if (value >= 40) {
      return {
        text: "text-orange-600",
        bar: "bg-orange-500",
        background: "bg-orange-50",
        border: "border-orange-200",
      };
    }

    if (value >= 20) {
      return {
        text: "text-amber-600",
        bar: "bg-amber-500",
        background: "bg-amber-50",
        border: "border-amber-200",
      };
    }

    return {
      text: "text-emerald-600",
      bar: "bg-emerald-500",
      background: "bg-emerald-50",
      border: "border-emerald-200",
    };
  }

  const overallColors =
    colorForRisk(overallRisk);

  return (
    <div className="min-h-[590px] bg-[#f4f6f8] p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-6 border-b border-slate-300 pb-6 pr-36 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              SupplyAI Risk Engine
            </p>

            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Risk Intelligence
            </h2>

            <p className="mt-2 max-w-xl text-sm text-slate-500">
              SupplyAI decomposes shipment
              exposure across live weather,
              routing, cargo, and operational
              factors.
            </p>
          </div>

          <div
            className={`min-w-[190px] border ${overallColors.border} ${overallColors.background} px-5 py-4`}
          >
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
              Overall Exposure
            </p>

            <div className="mt-2 flex items-end justify-between gap-4">
              <p
                className={`text-4xl font-black tracking-[-0.05em] ${overallColors.text}`}
              >
                {overallRisk}%
              </p>

              <p
                className={`pb-1 text-[10px] font-black uppercase ${overallColors.text}`}
              >
                {labelForRisk(overallRisk)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {riskItems.map((item) => {
            const colors =
              colorForRisk(item.value);

            return (
              <div
                key={item.label}
                className="border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                      {item.label}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {item.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-xl font-black ${colors.text}`}
                    >
                      {item.value}%
                    </p>

                    <p
                      className={`mt-1 text-[9px] font-black uppercase ${colors.text}`}
                    >
                      {labelForRisk(item.value)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 h-2 w-full overflow-hidden bg-slate-100">
                  <div
                    className={`h-full ${colors.bar} transition-all duration-500`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, item.value)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`mt-6 border ${overallColors.border} ${overallColors.background} p-6`}
        >
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p
                className={`text-[10px] font-black uppercase tracking-[0.18em] ${overallColors.text}`}
              >
                SupplyAI Assessment
              </p>

              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                {disrupted
                  ? "INTERVENTION REQUIRED"
                  : overallRisk >= 40
                    ? "MONITOR SHIPMENT"
                    : "PROCEED"}
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {disrupted
                  ? "Current routing exceeds SupplyAI's operating risk threshold. Alternative options have been re-ranked to reduce disruption exposure."
                  : overallRisk >= 40
                    ? "Exposure is elevated. Continue monitoring conditions and prepare a contingency option."
                    : "Current exposure remains within normal operating thresholds. No immediate intervention is required."}
              </p>
            </div>

            <div className="min-w-[220px] border border-slate-200 bg-white p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                Recommended Action
              </p>

              <p className="mt-2 text-sm font-black text-slate-950">
                {recommendation}
              </p>

              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                Selected from SupplyAI&apos;s
                alternative options.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [mapView, setMapView] =
    useState<"route" | "risk">("route");

  const [openPanel, setOpenPanel] =
    useState<PanelName | null>(null);

  const [showNewShipment, setShowNewShipment] =
    useState(false);

  const [origin, setOrigin] =
    useState("Shenzhen, China");

  const [destination, setDestination] =
    useState("Dublin, California");

  const [cargo, setCargo] = useState(
    "High-value electronics"
  );

  const [transport, setTransport] =
    useState("Ocean");

  const [activeOrigin, setActiveOrigin] =
    useState("Shenzhen, China");

  const [
    activeDestination,
    setActiveDestination,
  ] = useState("Dublin, California");

  const [activeCargo, setActiveCargo] =
    useState("High-value electronics");

  const [
    activeTransport,
    setActiveTransport,
  ] = useState("Ocean");

  const [originLocation, setOriginLocation] =
    useState<GeocodedLocation>({
      name: "Shenzhen, China",
      displayName: "Shenzhen, China",
      latitude: 22.5431,
      longitude: 114.0579,
    });

  const [
    destinationLocation,
    setDestinationLocation,
  ] = useState<GeocodedLocation>({
    name: "Dublin, California",
    displayName: "Dublin, California",
    latitude: 37.7022,
    longitude: -121.9358,
  });

  const [weather, setWeather] =
    useState<WeatherResult | null>(null);

  const [analyzing, setAnalyzing] =
    useState(false);

  const [analysisError, setAnalysisError] =
    useState("");

  const [
    disruptionActive,
    setDisruptionActive,
  ] = useState(false);

  const togglePanel = (panel: PanelName) => {
    setOpenPanel((current) =>
      current === panel ? null : panel
    );
  };

  const estimate = useMemo(
    () =>
      calculateShipmentEstimate(
        originLocation,
        destinationLocation,
        activeTransport,
        weather?.riskScore ?? 0,
        disruptionActive
      ),
    [
      originLocation,
      destinationLocation,
      activeTransport,
      weather,
      disruptionActive,
    ]
  );

  const alternativeOptions = useMemo(
    () =>
      calculateAlternativeOptions(
        originLocation,
        destinationLocation,
        weather?.riskScore ?? 0,
        disruptionActive
      ),
    [
      originLocation,
      destinationLocation,
      weather,
      disruptionActive,
    ]
  );

  const recommendedOption = useMemo(
    () =>
      chooseRecommendedOption(
        alternativeOptions,
        disruptionActive
      ),
    [alternativeOptions, disruptionActive]
  );

  const costReview =
    estimate.estimatedCost >=
    COST_REVIEW_THRESHOLD;

  const interventionRequired =
    estimate.overallRisk >= 70 ||
    disruptionActive;

  const shipmentStatus =
    interventionRequired
      ? "Intervention"
      : costReview
        ? "Cost Review"
        : estimate.overallRisk >= 40
          ? "Monitor"
          : "On Track";

  const networkStatus =
    interventionRequired
      ? "Elevated"
      : estimate.overallRisk >= 40
        ? "Watch"
        : "Nominal";

  const analyzeShipment = async () => {
    setAnalyzing(true);
    setAnalysisError("");

    try {
      const [
        originResponse,
        destinationResponse,
      ] = await Promise.all([
        fetch(
          `/api/geocode?location=${encodeURIComponent(
            origin
          )}`
        ),
        fetch(
          `/api/geocode?location=${encodeURIComponent(
            destination
          )}`
        ),
      ]);

      if (!originResponse.ok) {
        throw new Error(
          "Could not locate shipment origin."
        );
      }

      if (!destinationResponse.ok) {
        throw new Error(
          "Could not locate shipment destination."
        );
      }

      const [
        originData,
        destinationData,
      ] = await Promise.all([
        originResponse.json(),
        destinationResponse.json(),
      ]);

      if (
        !originData.success ||
        !originData.location
      ) {
        throw new Error(
          originData.error ||
          "Could not locate shipment origin."
        );
      }

      if (
        !destinationData.success ||
        !destinationData.location
      ) {
        throw new Error(
          destinationData.error ||
          "Could not locate shipment destination."
        );
      }

      const newOrigin =
        originData.location as GeocodedLocation;

      const newDestination =
        destinationData.location as GeocodedLocation;

      const directDistanceKm = calculateDistanceKm(
        newOrigin,
        newDestination
      );

      // Prevent meaningless same-location shipments.
      if (directDistanceKm < 1) {
        throw new Error(
          "Origin and destination cannot be the same location. Please enter two different locations."
        );
      }

      // Ground-only freight should not be used for extremely long
      // international routes that would require another transport mode.
      if (
        transport === "Ground" &&
        directDistanceKm > 5000
      ) {
        throw new Error(
          "Ground-only route unavailable. This shipment requires multiple transport modes. Please choose Ocean, Air, or Adaptive Multimodal."        );
      }

      // Ocean freight does not make sense for short/local shipments.
      if (
        transport === "Ocean" &&
        directDistanceKm < 300
      ) {
        throw new Error(
          "Ocean freight is not suitable for this short-distance shipment. Please choose Ground freight."
        );
      }
      const weatherResponse = await fetch(
        `/api/weather?lat=${newOrigin.latitude}&lon=${newOrigin.longitude}`
      );

      if (!weatherResponse.ok) {
        throw new Error(
          "Could not retrieve live weather."
        );
      }

      const weatherData =
        await weatherResponse.json();

      if (
        !weatherData.success ||
        !weatherData.weather
      ) {
        throw new Error(
          weatherData.error ||
          "Weather analysis failed."
        );
      }

      setOriginLocation(newOrigin);
      setDestinationLocation(newDestination);
      setWeather(weatherData.weather);

      setActiveOrigin(origin);
      setActiveDestination(destination);
      setActiveCargo(cargo);
      if (transport === "Multimodal") {
        const adaptiveOptions =
          calculateAlternativeOptions(
            newOrigin,
            newDestination,
            weatherData.weather.riskScore ?? 0,
            false
          );

        const adaptiveRecommendation =
          chooseRecommendedOption(
            adaptiveOptions,
            false
          );

        setActiveTransport(
          adaptiveRecommendation.name
        );
      } else {
        setActiveTransport(transport);
      }
      setDisruptionActive(false);
      setMapView("route");
      setOpenPanel(null);
      setShowNewShipment(false);
    } catch (error) {
      console.error(
        "Shipment analysis error:",
        error
      );

      setAnalysisError(
        error instanceof Error
          ? error.message
          : "SupplyAI could not analyze this shipment."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const resetDemo = () => {
    setOrigin("Shenzhen, China");
    setDestination("Dublin, California");
    setCargo("High-value electronics");
    setTransport("Ocean");

    setActiveOrigin("Shenzhen, China");
    setActiveDestination(
      "Dublin, California"
    );
    setActiveCargo(
      "High-value electronics"
    );
    setActiveTransport("Ocean");

    setOriginLocation({
      name: "Shenzhen, China",
      displayName: "Shenzhen, China",
      latitude: 22.5431,
      longitude: 114.0579,
    });

    setDestinationLocation({
      name: "Dublin, California",
      displayName: "Dublin, California",
      latitude: 37.7022,
      longitude: -121.9358,
    });

    setWeather(null);
    setAnalysisError("");
    setAnalyzing(false);
    setDisruptionActive(false);
    setMapView("route");
    setOpenPanel(null);
    setShowNewShipment(false);
  };

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-slate-950">
      {/* TOP NAVIGATION */}

      <header className="border-b border-slate-300 bg-[#f8f7f3]">
        <div className="flex h-16 items-center justify-between px-7">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center bg-slate-950 text-sm font-bold text-white">
                S
              </div>

              <div>
                <h1 className="text-lg font-bold tracking-[-0.03em]">
                  SUPPLYAI
                </h1>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Network Operations
                </p>
              </div>
            </div>

            <nav className="hidden items-center gap-6 text-xs font-semibold lg:flex">
              <button
                type="button"
                onClick={() => {
                  setMapView("route");
                  setOpenPanel(null);
                }}
                className={`transition hover:text-slate-950 ${mapView === "route"
                  ? "text-slate-950"
                  : "text-slate-500"
                  }`}
              >
                Live Network
              </button>

              <button
                type="button"
                onClick={() => {
                  setMapView("risk");
                  setOpenPanel("risk");
                }}
                className={`transition hover:text-slate-950 ${mapView === "risk"
                  ? "text-slate-950"
                  : "text-slate-500"
                  }`}
              >
                Risk Monitor
              </button>
            </nav>

            <div className="flex items-center gap-3">
              <div className="mr-2 hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
                <span
                  className={`h-2 w-2 rounded-full ${interventionRequired
                    ? "bg-red-500"
                    : "bg-emerald-500"
                    }`}
                />
                {interventionRequired
                  ? "NETWORK ALERT"
                  : "NETWORK NORMAL"}
              </div>

              <button
                onClick={() =>
                  setShowNewShipment(true)
                }
                className="bg-slate-950 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-slate-800"
              >
                + New Shipment
              </button>

              <button
                onClick={resetDemo}
                className="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide transition hover:bg-slate-100"
              >
                Reset Demo
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* NEW SHIPMENT */}

      {showNewShipment && (
        <section className="border-b border-slate-300 bg-white px-7 py-7">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Route Intelligence
                </p>

                <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                  Analyze a new shipment
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Enter shipment details for
                  SupplyAI to analyze.
                </p>
              </div>

              <button
                onClick={() =>
                  setShowNewShipment(false)
                }
                className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                CLOSE
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  From
                </label>
                <input
                  value={origin}
                  onChange={(e) =>
                    setOrigin(e.target.value)
                  }
                  placeholder="e.g. Tokyo, Japan"
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  To
                </label>
                <input
                  value={destination}
                  onChange={(e) =>
                    setDestination(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Dublin, California"
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Cargo
                </label>
                <input
                  value={cargo}
                  onChange={(e) =>
                    setCargo(e.target.value)
                  }
                  placeholder="e.g. Electronics"
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Transport
                </label>
                <select
                  value={transport}
                  onChange={(e) =>
                    setTransport(
                      e.target.value
                    )
                  }
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900"
                >
                  <option value="Ocean">
                    Ocean freight
                  </option>
                  <option value="Air">
                    Air freight
                  </option>
                  <option value="Ground">
                    Ground freight
                  </option>
                  <option value="Multimodal">
                    Adaptive Multimodal
                  </option>
                </select>
              </div>
            </div>

            {analysisError && (
              <p className="mt-4 text-xs font-semibold text-red-600">
                {analysisError}
              </p>
            )}

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
              <button
                onClick={analyzeShipment}
                disabled={
                  !origin.trim() ||
                  !destination.trim() ||
                  analyzing
                }
                className="bg-slate-950 px-7 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {analyzing
                  ? "Analyzing Live Data..."
                  : "Analyze Route →"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SHIPMENT CONTEXT */}

      <div className="border-b border-slate-300 bg-white">
        <div className="flex flex-col justify-between gap-4 px-7 py-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Control Tower
              </span>
              <span className="text-slate-300">
                /
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-700">
                SHP-2048
              </span>
            </div>

            <h2 className="text-3xl font-semibold tracking-[-0.04em]">
              {activeOrigin} →{" "}
              {activeDestination}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {activeTransport} freight ·{" "}
              {activeCargo}
            </p>
          </div>

          <span
            className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${interventionRequired
              ? "border-red-200 bg-red-50 text-red-700"
              : costReview ||
                estimate.overallRisk >= 40
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
          >
            {shipmentStatus}
          </span>
        </div>
      </div>

      {/* ALERT */}

      {(interventionRequired ||
        costReview) && (
          <section
            className={`border-b px-7 py-4 ${interventionRequired
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
              }`}
          >
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p
                  className={`text-[10px] font-bold uppercase tracking-[0.18em] ${interventionRequired
                    ? "text-red-700"
                    : "text-amber-700"
                    }`}
                >
                  {interventionRequired
                    ? "SupplyAI · Intervention Recommended"
                    : "SupplyAI · Cost Review"}
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {disruptionActive
                    ? `SupplyAI recommends ${recommendedOption.name}. Options have been re-ranked after the simulated disruption.`
                    : `Estimated shipment cost exceeds the ${formatCurrency(
                      COST_REVIEW_THRESHOLD
                    )} review threshold.`}
                </p>
              </div>

              <div className="text-xs font-semibold text-slate-600">
                Risk {estimate.overallRisk}% ·{" "}
                {estimate.etaDays} days ·{" "}
                {formatCurrency(
                  estimate.estimatedCost
                )}
              </div>
            </div>
          </section>
        )}

      {/* KPI STRIP */}

      <section className="grid border-b border-slate-300 bg-white py-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Estimated ETA"
          value={`${estimate.etaDays} days`}
          subtext={`${formatDistance(
            estimate.modeledDistanceKm
          )} km modeled route`}
          warning={disruptionActive}
        />

        <Stat
          label="Estimated Cost"
          value={formatCurrency(
            estimate.estimatedCost
          )}
          subtext="SupplyAI freight estimate"
          warning={costReview}
        />

        <Stat
          label="Route Exposure"
          value={`${estimate.overallRisk}%`}
          subtext={
            weather
              ? `${weather.riskLevel} live weather + route model`
              : "Modeled baseline risk"
          }
          warning={
            estimate.overallRisk >= 40
          }
        />

        <Stat
          label="Network Status"
          value={networkStatus}
          subtext={
            disruptionActive
              ? "1 simulated disruption"
              : "No active disruption scenario"
          }
          warning={interventionRequired}
        />
      </section>

      {/* MAIN WORKSPACE */}

      <section className="grid min-h-[590px] xl:grid-cols-[1fr_390px]">
        {/* ROUTE / RISK WORKSPACE */}

        <div className="relative min-h-[590px] border-r border-slate-300 bg-[#e8e7e1]">
          <div className="absolute right-6 top-6 z-[1100] flex border border-slate-300 bg-white p-1 shadow-sm">
            <button
              onClick={() =>
                setMapView("route")
              }
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${mapView === "route"
                ? "bg-slate-950 text-white"
                : "bg-white text-slate-500 hover:bg-slate-100"
                }`}
            >
              Route
            </button>

            <button
              onClick={() =>
                setMapView("risk")
              }
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${mapView === "risk"
                ? disruptionActive
                  ? "bg-red-600 text-white"
                  : "bg-slate-950 text-white"
                : "bg-white text-slate-500 hover:bg-slate-100"
                }`}
            >
              Risk
            </button>
          </div>

          {mapView === "route" ? (
            <>
              <div className="absolute left-6 top-6 z-[1000] max-w-[340px] border border-slate-300 bg-white/95 px-4 py-3 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Active Route
                </p>

                <p className="mt-1 truncate text-sm font-semibold">
                  {activeOrigin} →{" "}
                  {activeDestination}
                </p>

                <p className="mt-1 text-[10px] text-slate-500">
                  {formatDistance(
                    estimate.directDistanceKm
                  )}{" "}
                  km great-circle distance
                </p>
              </div>

              <div className="h-full min-h-[590px]">
                <SupplyMap
                  origin={[
                    originLocation.latitude,
                    originLocation.longitude,
                  ]}
                  destination={[
                    destinationLocation.latitude,
                    destinationLocation.longitude,
                  ]}
                  originName={activeOrigin}
                  destinationName={activeDestination}
                  transport={activeTransport}
                />
              </div>

              <div className="absolute bottom-5 left-6 z-[1000] border border-slate-300 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
                  <span
                    className={`h-2 w-2 rounded-full ${disruptionActive
                      ? "bg-red-500"
                      : "bg-emerald-500"
                      }`}
                  />

                  {disruptionActive
                    ? "Disruption active"
                    : "Route monitored"}
                </div>
              </div>
            </>
          ) : (
            <RiskIntelligenceView
              overallRisk={
                estimate.overallRisk
              }
              weatherRisk={
                weather?.riskScore ?? 0
              }
              cargo={activeCargo}
              transport={activeTransport}
              disrupted={disruptionActive}
              recommendation={
                recommendedOption.name
              }
            />
          )}
        </div>

        {/* COMPACT RIGHT PANEL */}

        <aside className="bg-[#f8f7f3]">
          {/* SHIPMENT */}

          <div className="border-b border-slate-300">
            <button
              onClick={() =>
                togglePanel("shipment")
              }
              className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Shipment
                </p>

                <p className="mt-1 truncate text-sm font-bold">
                  {activeOrigin} →{" "}
                  {activeDestination}
                </p>

                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {activeTransport} ·{" "}
                  {activeCargo}
                </p>
              </div>

              <span className="text-xl font-light text-slate-400">
                {openPanel === "shipment"
                  ? "−"
                  : "+"}
              </span>
            </button>

            {openPanel === "shipment" && (
              <div className="border-t border-slate-200 bg-white p-5">
                <div className="grid gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Shipment ID
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold">
                      SHP-2048
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Origin
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {activeOrigin}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Destination
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {activeDestination}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400">
                        Transport
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {activeTransport}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400">
                        ETA
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {estimate.etaDays} days
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RISK */}

          <div className="border-b border-slate-300">
            <button
              onClick={() =>
                togglePanel("risk")
              }
              className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white"
            >
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Risk Intelligence
                </p>

                <div className="mt-1 flex items-center gap-3">
                  <p
                    className={`text-xl font-black ${riskColor(
                      estimate.overallRisk
                    )}`}
                  >
                    {estimate.overallRisk}%
                  </p>

                  <span
                    className={`text-[9px] font-black uppercase ${riskColor(
                      estimate.overallRisk
                    )}`}
                  >
                    {estimate.status}
                  </span>
                </div>

                <p className="mt-1 text-[10px] text-slate-500">
                  {weather
                    ? `${weather.riskLevel} live weather exposure`
                    : "Modeled baseline exposure"}
                </p>
              </div>

              <span className="text-xl font-light text-slate-400">
                {openPanel === "risk"
                  ? "−"
                  : "+"}
              </span>
            </button>

            {openPanel === "risk" && (
              <div className="border-t border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold">
                  What could threaten this
                  shipment?
                </p>

                {weather ? (
                  <>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {weather.summary}
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="border border-slate-200 p-2">
                        <p className="text-[8px] font-bold uppercase text-slate-400">
                          Temp
                        </p>
                        <p className="mt-1 text-xs font-bold">
                          {weather.temperature}
                          °C
                        </p>
                      </div>

                      <div className="border border-slate-200 p-2">
                        <p className="text-[8px] font-bold uppercase text-slate-400">
                          Wind
                        </p>
                        <p className="mt-1 text-xs font-bold">
                          {weather.windSpeed}{" "}
                          km/h
                        </p>
                      </div>

                      <div className="border border-slate-200 p-2">
                        <p className="text-[8px] font-bold uppercase text-slate-400">
                          Rain
                        </p>
                        <p className="mt-1 text-xs font-bold">
                          {
                            weather.precipitation
                          }{" "}
                          mm
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Analyze a shipment to load
                    live weather intelligence.
                  </p>
                )}

                {disruptionActive && (
                  <div className="mt-4 border border-red-200 bg-red-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-red-700">
                      Critical Disruption
                    </p>

                    <p className="mt-1 text-xs font-semibold">
                      Port congestion +
                      downstream logistics delay
                    </p>

                    <p className="mt-1 text-[11px] leading-4 text-slate-600">
                      Current routing is projected
                      to add 5 days and increase
                      freight cost by 25%.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RECOMMENDATION */}

          <div className="border-b border-slate-300 bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Recommendation
                </p>

                <p className="mt-1 text-sm font-black">
                  {recommendedOption.name}
                </p>
              </div>

              <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-emerald-700">
                Best Option
              </span>
            </div>
          </div>

          {/* ALTERNATIVES */}

          <div className="border-b border-slate-300">
            <button
              onClick={() =>
                togglePanel("alternatives")
              }
              className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white"
            >
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Alternative Routes
                </p>

                <p className="mt-1 text-sm font-bold">
                  {alternativeOptions.length}{" "}
                  options analyzed
                </p>

                <p className="mt-1 text-[10px] text-slate-500">
                  Compare ETA · cost · risk
                </p>
              </div>

              <span className="text-xl font-light text-slate-400">
                {openPanel ===
                  "alternatives"
                  ? "−"
                  : "+"}
              </span>
            </button>

            {openPanel ===
              "alternatives" && (
                <div className="border-t border-slate-200 bg-white">
                  {alternativeOptions.map(
                    (option) => {
                      const recommended =
                        option.name ===
                        recommendedOption.name;

                      return (
                        <div
                          key={option.name}
                          className={`border-b border-slate-100 p-4 last:border-b-0 ${recommended
                            ? "border-l-4 border-l-emerald-500 bg-emerald-50/60"
                            : "border-l-4 border-l-transparent"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              {recommended && (
                                <p className="mb-1 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-700">
                                  Recommended
                                </p>
                              )}

                              <p className="text-xs font-bold">
                                {option.name}
                              </p>

                              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                {
                                  option.description
                                }
                              </p>
                            </div>

                            <p
                              className={`text-xs font-black ${riskColor(
                                option.risk
                              )}`}
                            >
                              {option.risk}%
                            </p>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-semibold text-slate-600">
                            <span>
                              {option.etaDays} days
                            </span>
                            <span>
                              {formatCurrency(
                                option.cost
                              )}
                            </span>
                            <span>
                              {option.risk}% risk
                            </span>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
          </div>

          {/* AGENT ACTIVITY */}

          <div className="border-b border-slate-300">
            <button
              onClick={() =>
                togglePanel("activity")
              }
              className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white"
            >
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Agent Activity
                </p>

                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-sm font-bold">
                    3 engines active
                  </p>
                </div>

                <p className="mt-1 text-[10px] text-slate-500">
                  Risk · Cost · Decision
                </p>
              </div>

              <span className="text-xl font-light text-slate-400">
                {openPanel === "activity"
                  ? "−"
                  : "+"}
              </span>
            </button>

            {openPanel === "activity" && (
              <div className="border-t border-slate-200 bg-white p-5">
                <div className="border-l-2 border-slate-300 pl-4">
                  <p className="font-mono text-[9px] text-slate-400">
                    RISK ENGINE
                  </p>

                  <p className="mt-1 text-xs font-semibold">
                    {disruptionActive
                      ? "Disruption detected and options re-ranked"
                      : "Shipment exposure calculated"}
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    Current exposure:{" "}
                    {estimate.overallRisk}%.
                  </p>
                </div>

                <div className="mt-4 border-l-2 border-slate-300 pl-4">
                  <p className="font-mono text-[9px] text-slate-400">
                    COST ENGINE
                  </p>

                  <p className="mt-1 text-xs font-semibold">
                    Freight estimate generated
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    {formatCurrency(
                      estimate.estimatedCost
                    )}{" "}
                    · {estimate.etaDays} day
                    ETA
                  </p>
                </div>

                <div className="mt-4 border-l-2 border-emerald-500 pl-4">
                  <p className="font-mono text-[9px] text-emerald-700">
                    DECISION ENGINE
                  </p>

                  <p className="mt-1 text-xs font-semibold">
                    {recommendedOption.name}
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    Best modeled response based
                    on risk, time, and cost.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* DISRUPTION BUTTON */}

          <div className="p-5">
            <button
              onClick={() => {
                const activating =
                  !disruptionActive;

                setDisruptionActive(
                  activating
                );

                if (activating) {
                  setOpenPanel("risk");
                  setMapView("risk");
                }
              }}
              className={`w-full px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition ${disruptionActive
                ? "bg-red-700 hover:bg-red-800"
                : "bg-slate-950 hover:bg-slate-800"
                }`}
            >
              {disruptionActive
                ? "Clear Demo Disruption"
                : "Introduce Disruption"}
            </button>

            <p className="mt-2 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Simulation control · not live
              port data
            </p>
          </div>
        </aside>
      </section>

      <footer className="flex items-center justify-between border-t border-slate-300 bg-white px-7 py-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
          SupplyAI Network Intelligence
        </p>

        <p className="font-mono text-[9px] text-slate-400">
          LIVE DATA · MODELED LOGISTICS
          INTELLIGENCE
        </p>
      </footer>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import logisticsHubData from "@/data/logistics-hubs.json";

type Coordinate = [number, number];

type SupplyMapProps = {
  origin: Coordinate;
  destination: Coordinate;
  originName: string;
  destinationName: string;
  transport: string;
};

type GroundRouteResponse = {
  success: boolean;
  route?: {
    coordinates: Coordinate[];
    distanceKm: number;
    durationHours: number;
  };
};

type RouteSegment = {
  name: string;
  type: "ground" | "ocean" | "air";
  coordinates: Coordinate[];
};

type Port = {
  name: string;
  latitude: number;
  longitude: number;
};

type HubType =
  | "port"
  | "airport"
  | "warehouse"
  | "intermodal";

type LogisticsHub = {
  name: string;
  type: HubType;
  latitude: number;
  longitude: number;
  modeled?: boolean;
};

const PORTS: Port[] = [
  {
    name: "Port of Shenzhen",
    latitude: 22.51,
    longitude: 113.88,
  },
  {
    name: "Port of Shanghai",
    latitude: 31.23,
    longitude: 121.49,
  },
  {
    name: "Port of Singapore",
    latitude: 1.264,
    longitude: 103.84,
  },
  {
    name: "Port of Tokyo",
    latitude: 35.61,
    longitude: 139.78,
  },
  {
    name: "Port of Oakland",
    latitude: 37.8,
    longitude: -122.31,
  },
  {
    name: "Port of Los Angeles",
    latitude: 33.74,
    longitude: -118.27,
  },
  {
    name: "Port of Dublin",
    latitude: 53.35,
    longitude: -6.2,
  },
  {
    name: "Port of Rotterdam",
    latitude: 51.95,
    longitude: 4.14,
  },
];

const LOGISTICS_HUBS =
  logisticsHubData as LogisticsHub[];

const AIRPORTS = LOGISTICS_HUBS.filter(
  (hub) => hub.type === "airport"
);

const PACIFIC_ASIA_SIDE: Coordinate[] = [
  [22.51, 113.88],
  [21.5, 118.0],
  [20.5, 123.0],
  [21.0, 130.0],
  [24.0, 140.0],
  [28.0, 150.0],
  [32.0, 160.0],
  [35.0, 170.0],
  [37.0, 179.5],
];

const PACIFIC_AMERICA_SIDE: Coordinate[] = [
  [37.0, -179.5],
  [39.0, -170.0],
  [41.0, -160.0],
  [42.0, -150.0],
  [42.0, -140.0],
  [40.5, -130.0],
  [38.5, -124.0],
  [37.8, -122.31],
];

function distanceKm(
  a: Coordinate,
  b: Coordinate
) {
  const radius = 6371;

  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;

  const deltaLat =
    ((b[0] - a[0]) * Math.PI) / 180;

  const deltaLon =
    ((b[1] - a[1]) * Math.PI) / 180;

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    radius *
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    )
  );
}

function findNearestPort(
  location: Coordinate
) {
  return PORTS.reduce(
    (nearest, port) => {
      const currentDistance =
        distanceKm(location, [
          port.latitude,
          port.longitude,
        ]);

      const nearestDistance =
        distanceKm(location, [
          nearest.latitude,
          nearest.longitude,
        ]);

      return currentDistance <
        nearestDistance
        ? port
        : nearest;
    }
  );
}

function findNearestAirport(
  location: Coordinate
) {
  return AIRPORTS.reduce(
    (nearest, airport) => {
      const currentDistance =
        distanceKm(location, [
          airport.latitude,
          airport.longitude,
        ]);

      const nearestDistance =
        distanceKm(location, [
          nearest.latitude,
          nearest.longitude,
        ]);

      return currentDistance <
        nearestDistance
        ? airport
        : nearest;
    }
  );
}

function FitRoute({
  coordinates,
}: {
  coordinates: Coordinate[];
}) {
  const map = useMap();

  useEffect(() => {
    if (coordinates.length < 2) {
      return;
    }

    map.invalidateSize();

    map.fitBounds(coordinates, {
      padding: [60, 60],
    });
  }, [map, coordinates]);

  return null;
}

async function fetchGroundRoute(
  from: Coordinate,
  to: Coordinate
): Promise<Coordinate[]> {
  try {
    if (distanceKm(from, to) < 1) {
      return [from, to];
    }

    const params =
      new URLSearchParams({
        startLat: String(from[0]),
        startLon: String(from[1]),
        endLat: String(to[0]),
        endLon: String(to[1]),
      });

    const response = await fetch(
      `/api/route?${params.toString()}`
    );

    if (!response.ok) {
      console.warn(
        "Ground routing API could not calculate this leg."
      );

      return [from, to];
    }

    const data =
      (await response.json()) as GroundRouteResponse;

    if (
      !data.success ||
      !data.route?.coordinates?.length
    ) {
      return [from, to];
    }

    return data.route.coordinates;
  } catch (error) {
    console.error(
      "Ground route error:",
      error
    );

    return [from, to];
  }
}

function createOceanRoutes(
  departurePort: Port,
  arrivalPort: Port
): Coordinate[][] {
  const departure: Coordinate = [
    departurePort.latitude,
    departurePort.longitude,
  ];

  const arrival: Coordinate = [
    arrivalPort.latitude,
    arrivalPort.longitude,
  ];

  const eastAsiaOrigin =
    departurePort.longitude > 100 &&
    departurePort.longitude < 150;

  const californiaDestination =
    arrivalPort.longitude < -115 &&
    arrivalPort.longitude > -130;

  if (
    eastAsiaOrigin &&
    californiaDestination
  ) {
    return [
      [
        departure,
        ...PACIFIC_ASIA_SIDE,
      ],
      [
        ...PACIFIC_AMERICA_SIDE,
        arrival,
      ],
    ];
  }

  const californiaOrigin =
    departurePort.longitude < -115 &&
    departurePort.longitude > -130;

  const eastAsiaDestination =
    arrivalPort.longitude > 100 &&
    arrivalPort.longitude < 150;

  if (
    californiaOrigin &&
    eastAsiaDestination
  ) {
    return [
      [
        departure,
        ...[
          ...PACIFIC_AMERICA_SIDE,
        ].reverse(),
      ],
      [
        ...[
          ...PACIFIC_ASIA_SIDE,
        ].reverse(),
        arrival,
      ],
    ];
  }

  return [[departure, arrival]];
}

function createAirRoutes(
  departure: Coordinate,
  arrival: Coordinate
): Coordinate[][] {
  const routes: Coordinate[][] = [];
  let currentRoute: Coordinate[] = [];

  const steps = 48;

  let lon1 = departure[1];
  let lon2 = arrival[1];

  let deltaLon = lon2 - lon1;

  if (deltaLon > 180) {
    lon2 -= 360;
  } else if (deltaLon < -180) {
    lon2 += 360;
  }

  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;

    const latitude =
      departure[0] +
      (arrival[0] - departure[0]) *
        progress;

    let longitude =
      lon1 +
      (lon2 - lon1) *
        progress;

    while (longitude > 180) {
      longitude -= 360;
    }

    while (longitude < -180) {
      longitude += 360;
    }

    const point: Coordinate = [
      latitude,
      longitude,
    ];

    if (
      currentRoute.length > 0 &&
      Math.abs(
        point[1] -
          currentRoute[
            currentRoute.length - 1
          ][1]
      ) > 180
    ) {
      routes.push(currentRoute);
      currentRoute = [];
    }

    currentRoute.push(point);
  }

  if (currentRoute.length > 0) {
    routes.push(currentRoute);
  }

  return routes;
}

function hubTypeLabel(
  type: HubType
) {
  if (type === "port") {
    return "PORT";
  }

  if (type === "airport") {
    return "AIR CARGO";
  }

  if (type === "warehouse") {
    return "WAREHOUSE / DISTRIBUTION";
  }

  return "INTERMODAL TRANSFER";
}

export default function SupplyMap({
  origin,
  destination,
  originName,
  destinationName,
  transport,
}: SupplyMapProps) {
  const [segments, setSegments] =
    useState<RouteSegment[]>([]);

  const [
    loadingRoute,
    setLoadingRoute,
  ] = useState(true);

  const departurePort = useMemo(
    () => findNearestPort(origin),
    [origin]
  );

  const arrivalPort = useMemo(
    () => findNearestPort(destination),
    [destination]
  );

  const departureAirport = useMemo(
    () => findNearestAirport(origin),
    [origin]
  );

  const arrivalAirport = useMemo(
    () => findNearestAirport(destination),
    [destination]
  );

  const routeMode = useMemo(() => {
    const value =
      transport.toLowerCase();

    if (
      value.includes("air") &&
      value.includes("ocean")
    ) {
      return "multimodal";
    }

    if (value.includes("air")) {
      return "air";
    }

    if (value.includes("ocean")) {
      return "ocean";
    }

    if (value.includes("ground")) {
      return "ground";
    }

    if (
      value.includes("adaptive") ||
      value.includes("multimodal")
    ) {
      return "multimodal";
    }

    return "ocean";
  }, [transport]);

  useEffect(() => {
    let cancelled = false;

    async function buildRoute() {
      setLoadingRoute(true);

      if (routeMode === "ground") {
        const groundRoute =
          await fetchGroundRoute(
            origin,
            destination
          );

        if (cancelled) {
          return;
        }

        setSegments([
          {
            name:
              `${originName} → ` +
              `${destinationName}`,
            type: "ground",
            coordinates: groundRoute,
          },
        ]);

        setLoadingRoute(false);
        return;
      }

      if (routeMode === "air") {
        const departureCoordinate:
          Coordinate = [
          departureAirport.latitude,
          departureAirport.longitude,
        ];

        const arrivalCoordinate:
          Coordinate = [
          arrivalAirport.latitude,
          arrivalAirport.longitude,
        ];

        const [
          originGroundRoute,
          destinationGroundRoute,
        ] = await Promise.all([
          fetchGroundRoute(
            origin,
            departureCoordinate
          ),
          fetchGroundRoute(
            arrivalCoordinate,
            destination
          ),
        ]);

        if (cancelled) {
          return;
        }

        const airRoutes =
          createAirRoutes(
            departureCoordinate,
            arrivalCoordinate
          );

        const airSegments:
          RouteSegment[] =
          airRoutes.map(
            (coordinates, index) => ({
              name:
                `${departureAirport.name} → ` +
                `${arrivalAirport.name} ` +
                `air segment ${index + 1}`,
              type: "air",
              coordinates,
            })
          );

        setSegments([
          {
            name:
              `${originName} → ` +
              `${departureAirport.name}`,
            type: "ground",
            coordinates:
              originGroundRoute,
          },
          ...airSegments,
          {
            name:
              `${arrivalAirport.name} → ` +
              `${destinationName}`,
            type: "ground",
            coordinates:
              destinationGroundRoute,
          },
        ]);

        setLoadingRoute(false);
        return;
      }

      if (routeMode === "multimodal") {
        const departureCoordinate:
          Coordinate = [
          departureAirport.latitude,
          departureAirport.longitude,
        ];

        const arrivalCoordinate:
          Coordinate = [
          arrivalAirport.latitude,
          arrivalAirport.longitude,
        ];

        const [
          originGroundRoute,
          destinationGroundRoute,
        ] = await Promise.all([
          fetchGroundRoute(
            origin,
            departureCoordinate
          ),
          fetchGroundRoute(
            arrivalCoordinate,
            destination
          ),
        ]);

        if (cancelled) {
          return;
        }

        const airRoutes =
          createAirRoutes(
            departureCoordinate,
            arrivalCoordinate
          );

        const airSegments:
          RouteSegment[] =
          airRoutes.map(
            (coordinates, index) => ({
              name:
                `${departureAirport.name} → ` +
                `${arrivalAirport.name} ` +
                `air segment ${index + 1}`,
              type: "air",
              coordinates,
            })
          );

        setSegments([
          {
            name:
              `${originName} → ` +
              `${departureAirport.name}`,
            type: "ground",
            coordinates:
              originGroundRoute,
          },
          ...airSegments,
          {
            name:
              `${arrivalAirport.name} → ` +
              `${destinationName}`,
            type: "ground",
            coordinates:
              destinationGroundRoute,
          },
        ]);

        setLoadingRoute(false);
        return;
      }

      const departureCoordinate:
        Coordinate = [
        departurePort.latitude,
        departurePort.longitude,
      ];

      const arrivalCoordinate:
        Coordinate = [
        arrivalPort.latitude,
        arrivalPort.longitude,
      ];

      const [
        originGroundRoute,
        destinationGroundRoute,
      ] = await Promise.all([
        fetchGroundRoute(
          origin,
          departureCoordinate
        ),
        fetchGroundRoute(
          arrivalCoordinate,
          destination
        ),
      ]);

      if (cancelled) {
        return;
      }

      const oceanRoutes =
        createOceanRoutes(
          departurePort,
          arrivalPort
        );

      const oceanSegments:
        RouteSegment[] =
        oceanRoutes.map(
          (coordinates, index) => ({
            name:
              `${departurePort.name} → ` +
              `${arrivalPort.name} ` +
              `ocean segment ${index + 1}`,
            type: "ocean",
            coordinates,
          })
        );

      setSegments([
        {
          name:
            `${originName} → ` +
            `${departurePort.name}`,
          type: "ground",
          coordinates:
            originGroundRoute,
        },
        ...oceanSegments,
        {
          name:
            `${arrivalPort.name} → ` +
            `${destinationName}`,
          type: "ground",
          coordinates:
            destinationGroundRoute,
        },
      ]);

      setLoadingRoute(false);
    }

    buildRoute();

    return () => {
      cancelled = true;
    };
  }, [
    origin,
    destination,
    originName,
    destinationName,
    routeMode,
    departurePort,
    arrivalPort,
    departureAirport,
    arrivalAirport,
  ]);

  const allCoordinates = useMemo(
    () =>
      segments.flatMap(
        (segment) =>
          segment.coordinates
      ),
    [segments]
  );

  const showPorts =
    routeMode === "ocean";

  const showAirports =
    routeMode === "air" ||
    routeMode === "multimodal";

  return (
    <div className="relative h-full min-h-[590px] w-full">
      <MapContainer
        center={[30, 0]}
        zoom={2}
        minZoom={2}
        scrollWheelZoom={true}
        className="h-full min-h-[590px] w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {allCoordinates.length > 1 && (
          <FitRoute
            coordinates={
              allCoordinates
            }
          />
        )}

        {LOGISTICS_HUBS.map(
          (hub, index) => (
            <CircleMarker
              key={`${hub.name}-${index}`}
              center={[
                hub.latitude,
                hub.longitude,
              ]}
              radius={
                hub.type === "port" ||
                hub.type === "airport"
                  ? 4
                  : 3
              }
              pathOptions={{
                color: "#ffffff",
                weight: 1,
                fillColor: "#dc2626",
                fillOpacity: 0.82,
              }}
            >
              <Popup>
                <strong>
                  {hub.name}
                </strong>

                <br />

                {hubTypeLabel(
                  hub.type
                )}

                {hub.modeled && (
                  <>
                    <br />
                    Modeled SupplyAI
                    network node
                  </>
                )}
              </Popup>
            </CircleMarker>
          )
        )}

        {segments.map(
          (segment, index) => (
            <Polyline
              key={`${segment.name}-${index}`}
              positions={
                segment.coordinates
              }
              pathOptions={{
                color:
                  segment.type ===
                  "ocean"
                    ? "#2563eb"
                    : segment.type ===
                        "air"
                      ? "#7c3aed"
                      : "#0f172a",
                weight:
                  segment.type ===
                  "ground"
                    ? 5
                    : 4,
                opacity: 0.92,
                dashArray:
                  segment.type ===
                  "ocean"
                    ? "9 7"
                    : segment.type ===
                        "air"
                      ? "4 8"
                      : undefined,
              }}
            />
          )
        )}

        <CircleMarker
          center={origin}
          radius={7}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: "#0f172a",
            fillOpacity: 1,
          }}
        >
          <Popup>
            <strong>
              {originName}
            </strong>
            <br />
            Shipment origin
          </Popup>
        </CircleMarker>

        {showPorts && (
          <>
            <CircleMarker
              center={[
                departurePort.latitude,
                departurePort.longitude,
              ]}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                weight: 3,
                fillColor: "#2563eb",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>
                  {departurePort.name}
                </strong>
                <br />
                ACTIVE DEPARTURE PORT
                <br />
                Ground → Ocean transfer
              </Popup>
            </CircleMarker>

            <CircleMarker
              center={[
                arrivalPort.latitude,
                arrivalPort.longitude,
              ]}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                weight: 3,
                fillColor: "#2563eb",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>
                  {arrivalPort.name}
                </strong>
                <br />
                ACTIVE ARRIVAL PORT
                <br />
                Ocean → Ground transfer
              </Popup>
            </CircleMarker>
          </>
        )}

        {showAirports && (
          <>
            <CircleMarker
              center={[
                departureAirport.latitude,
                departureAirport.longitude,
              ]}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                weight: 3,
                fillColor: "#7c3aed",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>
                  {departureAirport.name}
                </strong>
                <br />
                ACTIVE DEPARTURE AIRPORT
                <br />
                Ground → Air transfer
              </Popup>
            </CircleMarker>

            <CircleMarker
              center={[
                arrivalAirport.latitude,
                arrivalAirport.longitude,
              ]}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                weight: 3,
                fillColor: "#7c3aed",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>
                  {arrivalAirport.name}
                </strong>
                <br />
                ACTIVE ARRIVAL AIRPORT
                <br />
                Air → Ground transfer
              </Popup>
            </CircleMarker>
          </>
        )}

        <CircleMarker
          center={destination}
          radius={7}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: "#0f172a",
            fillOpacity: 1,
          }}
        >
          <Popup>
            <strong>
              {destinationName}
            </strong>
            <br />
            Final destination
          </Popup>
        </CircleMarker>
      </MapContainer>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] border border-slate-200 bg-white px-3 py-2 shadow-sm">
        {loadingRoute ? (
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
            Calculating logistics
            route...
          </p>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-600" />

              <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-700">
                Logistics Network
              </span>
            </div>

            <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {LOGISTICS_HUBS.length}{" "}
              nodes · Ports · Air
              Cargo · Warehouses ·
              Intermodal
            </p>

            <p className="mt-1 text-[8px] font-black uppercase tracking-[0.08em] text-slate-600">
              Active: {transport}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
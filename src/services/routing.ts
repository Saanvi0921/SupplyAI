export type TransportMode =
  | "Ground"
  | "Ocean"
  | "Air";

export type RouteStopType =
  | "origin"
  | "destination"
  | "port"
  | "airport"
  | "transfer";

export type RouteStop = {
  name: string;
  latitude: number;
  longitude: number;
  type: RouteStopType;
};

export type RouteLeg = {
  id: string;
  mode: TransportMode;
  from: RouteStop;
  to: RouteStop;

  /*
   * This will contain the actual route geometry.
   * Ground routes can contain road coordinates.
   * Ocean routes can contain maritime waypoints.
   * Air routes can contain flight-path coordinates.
   */
  coordinates: [number, number][];
};

export type LogisticsRoute = {
  id: string;
  name: string;
  description: string;
  stops: RouteStop[];
  legs: RouteLeg[];
};

type Location = {
  name: string;
  latitude: number;
  longitude: number;
};

type Hub = {
  name: string;
  latitude: number;
  longitude: number;
};

const PORTS: Hub[] = [
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
    name: "Port of Rotterdam",
    latitude: 51.95,
    longitude: 4.14,
  },
  {
    name: "Port of Dublin",
    latitude: 53.35,
    longitude: -6.2,
  },
  {
    name: "Port of Los Angeles",
    latitude: 33.74,
    longitude: -118.27,
  },
  {
    name: "Port of Oakland",
    latitude: 37.8,
    longitude: -122.31,
  },
  {
    name: "Port of Tokyo",
    latitude: 35.61,
    longitude: 139.78,
  },
];

const AIRPORTS: Hub[] = [
  {
    name: "Shenzhen Bao'an International Airport",
    latitude: 22.6393,
    longitude: 113.8107,
  },
  {
    name: "Dublin Airport",
    latitude: 53.4213,
    longitude: -6.2701,
  },
  {
    name: "Tokyo Haneda Airport",
    latitude: 35.5494,
    longitude: 139.7798,
  },
  {
    name: "San Francisco International Airport",
    latitude: 37.6213,
    longitude: -122.379,
  },
  {
    name: "Los Angeles International Airport",
    latitude: 33.9416,
    longitude: -118.4085,
  },
];

function distanceKm(
  a: {
    latitude: number;
    longitude: number;
  },
  b: {
    latitude: number;
    longitude: number;
  }
) {
  const radius = 6371;

  const lat1 =
    (a.latitude * Math.PI) / 180;

  const lat2 =
    (b.latitude * Math.PI) / 180;

  const deltaLat =
    ((b.latitude - a.latitude) *
      Math.PI) /
    180;

  const deltaLon =
    ((b.longitude - a.longitude) *
      Math.PI) /
    180;

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

function nearestHub(
  location: Location,
  hubs: Hub[]
) {
  return hubs.reduce(
    (nearest, current) =>
      distanceKm(location, current) <
      distanceKm(location, nearest)
        ? current
        : nearest
  );
}

function makeStop(
  hub: Hub,
  type: RouteStopType
): RouteStop {
  return {
    name: hub.name,
    latitude: hub.latitude,
    longitude: hub.longitude,
    type,
  };
}

function makeLocationStop(
  location: Location,
  type: "origin" | "destination"
): RouteStop {
  return {
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    type,
  };
}

function basicCoordinates(
  from: RouteStop,
  to: RouteStop
): [number, number][] {
  /*
   * Temporary geometry fallback.
   *
   * SupplyMap should NOT ultimately use this as
   * the final route. The next routing API step
   * replaces this with actual road/maritime
   * geometry.
   */
  return [
    [from.latitude, from.longitude],
    [to.latitude, to.longitude],
  ];
}

function createLeg(
  id: string,
  mode: TransportMode,
  from: RouteStop,
  to: RouteStop
): RouteLeg {
  return {
    id,
    mode,
    from,
    to,
    coordinates: basicCoordinates(
      from,
      to
    ),
  };
}

export function buildRouteOptions(
  origin: Location,
  destination: Location
): LogisticsRoute[] {
  const originStop = makeLocationStop(
    origin,
    "origin"
  );

  const destinationStop =
    makeLocationStop(
      destination,
      "destination"
    );

  const departurePort = makeStop(
    nearestHub(origin, PORTS),
    "port"
  );

  const arrivalPort = makeStop(
    nearestHub(destination, PORTS),
    "port"
  );

  const departureAirport = makeStop(
    nearestHub(origin, AIRPORTS),
    "airport"
  );

  const arrivalAirport = makeStop(
    nearestHub(destination, AIRPORTS),
    "airport"
  );

  /*
   * OPTION 1
   * Ground → Ocean → Ground
   */
  const oceanRoute: LogisticsRoute = {
    id: "ocean-standard",

    name: "Ocean Standard",

    description:
      "Ground pickup, ocean freight, and final-mile ground delivery.",

    stops: [
      originStop,
      departurePort,
      arrivalPort,
      destinationStop,
    ],

    legs: [
      createLeg(
        "ocean-ground-origin",
        "Ground",
        originStop,
        departurePort
      ),

      createLeg(
        "ocean-main",
        "Ocean",
        departurePort,
        arrivalPort
      ),

      createLeg(
        "ocean-ground-destination",
        "Ground",
        arrivalPort,
        destinationStop
      ),
    ],
  };

  /*
   * OPTION 2
   * Ground → Air → Ground
   */
  const airRoute: LogisticsRoute = {
    id: "air-expedite",

    name: "Air Expedite",

    description:
      "Ground pickup, air freight, and final-mile ground delivery.",

    stops: [
      originStop,
      departureAirport,
      arrivalAirport,
      destinationStop,
    ],

    legs: [
      createLeg(
        "air-ground-origin",
        "Ground",
        originStop,
        departureAirport
      ),

      createLeg(
        "air-main",
        "Air",
        departureAirport,
        arrivalAirport
      ),

      createLeg(
        "air-ground-destination",
        "Ground",
        arrivalAirport,
        destinationStop
      ),
    ],
  };

  /*
   * OPTION 3
   * Ocean + Air contingency
   *
   * This demonstrates that an alternative
   * shipment does not have to use only one
   * freight mode.
   */
  const transferPort = makeStop(
    nearestHub(
      {
        name: "Transfer Region",
        latitude:
          (departurePort.latitude +
            arrivalPort.latitude) /
          2,
        longitude:
          (departurePort.longitude +
            arrivalPort.longitude) /
          2,
      },
      PORTS
    ),
    "transfer"
  );

  const transferAirport = makeStop(
    nearestHub(
      transferPort,
      AIRPORTS
    ),
    "airport"
  );

  const multimodalRoute: LogisticsRoute = {
    id: "multimodal-contingency",

    name: "Multimodal Contingency",

    description:
      "Ground, ocean, transfer, air, and final-mile ground routing.",

    stops: [
      originStop,
      departurePort,
      transferPort,
      transferAirport,
      arrivalAirport,
      destinationStop,
    ],

    legs: [
      createLeg(
        "multi-ground-origin",
        "Ground",
        originStop,
        departurePort
      ),

      createLeg(
        "multi-ocean",
        "Ocean",
        departurePort,
        transferPort
      ),

      createLeg(
        "multi-transfer",
        "Ground",
        transferPort,
        transferAirport
      ),

      createLeg(
        "multi-air",
        "Air",
        transferAirport,
        arrivalAirport
      ),

      createLeg(
        "multi-ground-destination",
        "Ground",
        arrivalAirport,
        destinationStop
      ),
    ],
  };

  return [
    oceanRoute,
    airRoute,
    multimodalRoute,
  ];
}
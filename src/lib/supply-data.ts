export type Coordinate = [number, number];

export type Location = {
  id: string;
  name: string;
  shortName: string;
  country: string;
  coordinates: Coordinate;
};

export type Route = {
  id: string;
  name: string;
  description: string;
  locationIds: string[];
  coordinates: Coordinate[];
  distanceKm: number;
  estimatedTimeDays: number;
  estimatedCost: number;
  riskScore: number;
};

export type Shipment = {
  id: string;
  cargo: string;
  status: "ON_TRACK" | "AT_RISK" | "CONTINGENCY_ACTIVE";
  originId: string;
  destinationId: string;
  activeRouteId: string;
  etaDays: number;
  estimatedCost: number;
  riskScore: number;
};

export const locations: Record<string, Location> = {
  shenzhen: {
    id: "shenzhen",
    name: "Shenzhen, China",
    shortName: "Shenzhen",
    country: "China",
    coordinates: [22.5431, 114.0579],
  },

  oakland: {
    id: "oakland",
    name: "Port of Oakland",
    shortName: "Oakland",
    country: "United States",
    coordinates: [37.7955, -122.278],
  },

  dublin: {
    id: "dublin",
    name: "Dublin, California",
    shortName: "Dublin",
    country: "United States",
    coordinates: [37.7022, -121.9358],
  },

  longBeach: {
    id: "longBeach",
    name: "Port of Long Beach",
    shortName: "Long Beach",
    country: "United States",
    coordinates: [33.7542, -118.2165],
  },

  vietnamSupplier: {
    id: "vietnamSupplier",
    name: "Ho Chi Minh City Supplier",
    shortName: "Vietnam Supplier",
    country: "Vietnam",
    coordinates: [10.8231, 106.6297],
  },
};

export const routes: Route[] = [
  {
    id: "original",
    name: "Oakland Direct",
    description: "Current route through the Port of Oakland",
    locationIds: ["shenzhen", "oakland", "dublin"],
    coordinates: [
      locations.shenzhen.coordinates,
      locations.oakland.coordinates,
      locations.dublin.coordinates,
    ],
    distanceKm: 11104,
    estimatedTimeDays: 12,
    estimatedCost: 8200,
    riskScore: 18,
  },

  {
    id: "long-beach",
    name: "Long Beach Diversion",
    description: "Divert ocean freight through Southern California",
    locationIds: ["shenzhen", "longBeach", "dublin"],
    coordinates: [
      locations.shenzhen.coordinates,
      locations.longBeach.coordinates,
      locations.dublin.coordinates,
    ],
    distanceKm: 11680,
    estimatedTimeDays: 14,
    estimatedCost: 9700,
    riskScore: 31,
  },

  {
    id: "vietnam-supplier",
    name: "Vietnam Supplier Switch",
    description: "Source replacement inventory from Vietnam",
    locationIds: ["vietnamSupplier", "oakland", "dublin"],
    coordinates: [
      locations.vietnamSupplier.coordinates,
      locations.oakland.coordinates,
      locations.dublin.coordinates,
    ],
    distanceKm: 12620,
    estimatedTimeDays: 13,
    estimatedCost: 10600,
    riskScore: 24,
  },
];

export const initialShipment: Shipment = {
  id: "SHP-2048",
  cargo: "High-value electronics",
  status: "ON_TRACK",
  originId: "shenzhen",
  destinationId: "dublin",
  activeRouteId: "original",
  etaDays: 12,
  estimatedCost: 8200,
  riskScore: 18,
};

export function getRouteById(routeId: string): Route {
  const route = routes.find((candidate) => candidate.id === routeId);

  if (!route) {
    throw new Error(`Unknown route: ${routeId}`);
  }

  return route;
}

export function getLocationById(locationId: string): Location {
  const location = locations[locationId];

  if (!location) {
    throw new Error(`Unknown location: ${locationId}`);
  }

  return location;
}
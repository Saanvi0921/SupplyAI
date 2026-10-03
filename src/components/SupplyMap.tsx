"use client";

import { useEffect } from "react";

import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

type Coordinate = [number, number];

type SupplyMapProps = {
  origin: Coordinate;
  destination: Coordinate;
  originName: string;
  destinationName: string;
};

function FitRoute({
  origin,
  destination,
}: {
  origin: Coordinate;
  destination: Coordinate;
}) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds([origin, destination], {
      padding: [70, 70],
    });
  }, [map, origin, destination]);

  return null;
}

export default function SupplyMap({
  origin,
  destination,
  originName,
  destinationName,
}: SupplyMapProps) {
  const route: Coordinate[] = [origin, destination];

  return (
    <div className="h-full min-h-[590px] w-full">
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

        <FitRoute
          origin={origin}
          destination={destination}
        />

        <Polyline
          positions={route}
          pathOptions={{
            color: "#0f172a",
            weight: 4,
            opacity: 0.9,
            dashArray: "8 8",
          }}
        />

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
            <strong>{originName}</strong>
            <br />
            Shipment origin
          </Popup>
        </CircleMarker>

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
            <strong>{destinationName}</strong>
            <br />
            Final destination
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
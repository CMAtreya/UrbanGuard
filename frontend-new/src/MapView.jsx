import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

const vehicleIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
  iconSize: [30, 30],
});

// Global patch: intercept all canvas getContext calls to add willReadFrequently
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextType, options = {}) {
  // Add willReadFrequently for 2d contexts (used by leaflet.heat)
  if (contextType === "2d") {
    options = { ...options, willReadFrequently: true };
  }
  return originalGetContext.call(this, contextType, options);
};

function HeatOverlay({ points }) {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!map) {
      return undefined;
    }

    const heatLayer = L.heatLayer([], {
      radius: 20,
      blur: 15,
      maxZoom: 1,
      gradient: {
        0.15: "#60a5fa",
        0.35: "#34d399",
        0.6: "#f59e0b",
        1: "#ef4444",
      },
    });

    heatLayer.addTo(map);
    heatLayerRef.current = heatLayer;

    return () => {
      if (map && heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
      }
      heatLayerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!heatLayerRef.current) {
      return;
    }

    heatLayerRef.current.setLatLngs(points);
  }, [points]);

  return null;
}

function parseLatLng(text) {
  const match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2])];
}

async function geocodeLocation(query) {
  const encoded = encodeURIComponent(query);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encoded}`
  );

  if (!response.ok) {
    throw new Error(`Failed to geocode: ${query}`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Location not found: ${query}`);
  }

  return [Number(results[0].lat), Number(results[0].lon)];
}

async function resolvePoint(input) {
  const parsed = parseLatLng(input);
  if (parsed) {
    return parsed;
  }

  return geocodeLocation(input);
}

async function fetchShortestRoute(startText, endText) {
  const [startLat, startLng] = await resolvePoint(startText);
  const [endLat, endLng] = await resolvePoint(endText);

  const routeUrl =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${startLng},${startLat};${endLng},${endLat}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const response = await fetch(routeUrl);
  if (!response.ok) {
    throw new Error("Unable to fetch route from OSRM");
  }

  const data = await response.json();
  const route = data?.routes?.[0]?.geometry?.coordinates;

  if (!Array.isArray(route) || route.length === 0) {
    throw new Error("No drivable route found between start and destination");
  }

  return route.map(([lng, lat]) => [lat, lng]);
}

function LiveVehicle({ events, routeRequest }) {
  const map = useMap();
  const [routePath, setRoutePath] = useState([[12.9716, 77.5946]]);
  const [routeError, setRouteError] = useState("");
  const [vehicleIndex, setVehicleIndex] = useState(0);

  const potholeEvents = useMemo(
    () =>
      events
        .filter((event) => event.event_type === "pothole")
        .map((event) => ({
          lat: Number(event.lat),
          lng: Number(event.lng),
        }))
        .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lng)),
    [events]
  );

  useEffect(() => {
    if (!routeRequest?.start || !routeRequest?.end) {
      return;
    }

    let disposed = false;

    const loadRoute = async () => {
      try {
        setRouteError("");
        const nextRoute = await fetchShortestRoute(routeRequest.start, routeRequest.end);
        if (disposed) {
          return;
        }

        setRoutePath(nextRoute);
        setVehicleIndex(0);
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "Failed to build route";
          setRouteError(message);
        }
      }
    };

    loadRoute();

    return () => {
      disposed = true;
    };
  }, [routeRequest]);

  useEffect(() => {
    if (routePath.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setVehicleIndex((currentIndex) => {
        if (currentIndex >= routePath.length - 1) {
          return currentIndex;
        }

        return currentIndex + 1;
      });
    }, 800);

    return () => window.clearInterval(interval);
  }, [routePath]);

  const position = routePath[Math.min(vehicleIndex, routePath.length - 1)] ?? [12.9716, 77.5946];
  const traveledPath = routePath.slice(0, Math.min(vehicleIndex + 1, routePath.length));

  useEffect(() => {
    if (!map || !routeRequest?.requestId || routePath.length <= 1) {
      return;
    }

    if (vehicleIndex === 0) {
      map.fitBounds(routePath, {
        padding: [60, 60],
        maxZoom: 16,
      });
      return;
    }

    map.panTo(position, {
      animate: true,
      duration: 0.7,
    });
  }, [map, position, routePath, routeRequest, vehicleIndex]);

  const distanceMeters = (lat1, lng1, lat2, lng2) => {
    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const nearestRouteIndex = (lat, lng) => {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < routePath.length; i += 1) {
      const [routeLat, routeLng] = routePath[i];
      const routeDistance = distanceMeters(lat, lng, routeLat, routeLng);

      if (routeDistance < nearestDistance) {
        nearestDistance = routeDistance;
        nearestIndex = i;
      }
    }

    return { nearestIndex, nearestDistance };
  };

  const potholeAheadMessage = useMemo(() => {
    if (routePath.length < 2 || potholeEvents.length === 0) {
      return "";
    }

    let nearestAheadDistance = Number.POSITIVE_INFINITY;

    potholeEvents.forEach((event) => {
      const { nearestIndex, nearestDistance } = nearestRouteIndex(event.lat, event.lng);

      const isAhead = nearestIndex >= vehicleIndex && nearestIndex <= vehicleIndex + 180;
      const isNearRoad = nearestDistance <= 35;

      if (!isAhead || !isNearRoad) {
        return;
      }

      const carDistance = distanceMeters(position[0], position[1], event.lat, event.lng);
      if (carDistance < nearestAheadDistance) {
        nearestAheadDistance = carDistance;
      }
    });

    if (nearestAheadDistance <= 220) {
      const roundedDistance = Math.max(10, Math.round(nearestAheadDistance / 10) * 10);
      return `Go slow. Pothole ahead (~${roundedDistance} m)`;
    }

    return "";
  }, [potholeEvents, position, routePath, vehicleIndex]);

  useEffect(() => {
    if (potholeAheadMessage) {
      console.log("⚠️", potholeAheadMessage);
    }
  }, [potholeAheadMessage]);

  return (
    <>
      <Marker position={position} icon={vehicleIcon}>
        {potholeAheadMessage ? (
          <Tooltip
            direction="top"
            offset={[0, -22]}
            permanent
            opacity={0.95}
            className="vehicle-warning-tooltip"
          >
            {potholeAheadMessage}
          </Tooltip>
        ) : null}
      </Marker>
      <Polyline positions={routePath} color="#334155" weight={4} opacity={0.6} />
      <Polyline positions={traveledPath} color="#2563eb" weight={4} />
      {routeError ? (
        <Popup position={position} autoPan={false} closeButton={false} autoClose={false}>
          {routeError}
        </Popup>
      ) : null}
    </>
  );
}

function matchesFilter(event, activeFilter) {
  if (activeFilter === "all") {
    return true;
  }

  if (activeFilter === "potholes") {
    return event.event_type === "pothole";
  }

  if (activeFilter === "crashes") {
    return event.event_type === "crash";
  }

  if (activeFilter === "safe-roads") {
    return event.event_type === "speed_breaker";
  }

  return true;
}

function markerColor(eventType) {
  if (eventType === "pothole") {
    return "#ef4444";
  }

  if (eventType === "crash") {
    return "#111827";
  }

  return "#f59e0b";
}

function predictionToRisk(prediction) {
  if (prediction >= 2) {
    return { label: "High risk", color: "#ef4444" };
  }

  if (prediction === 1) {
    return { label: "Medium risk", color: "#f59e0b" };
  }

  return { label: "Safe", color: "#22c55e" };
}

export default function MapView({ events, activeFilter, routeRequest, showPredictedRiskZones }) {
  const [predictedRiskZones, setPredictedRiskZones] = useState([]);
  const predictionCacheRef = useRef(new Map());

  const visibleEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, activeFilter)),
    [activeFilter, events]
  );

  const heatPoints = useMemo(
    () =>
      events
        .filter((event) => event.event_type === "pothole" || event.event_type === "crash")
        .map((event) => [
          Number(event.lat),
          Number(event.lng),
          Math.max(0.35, Math.min(1, Number(event.confidence) || 0.65)),
        ]),
    [events]
  );

  useEffect(() => {
    if (!showPredictedRiskZones) {
      setPredictedRiskZones([]);
      return;
    }

    if (events.length === 0) {
      setPredictedRiskZones([]);
      return;
    }

    let cancelled = false;

    const runPredictionLayer = async () => {
      const sourceEvents = events
        .filter((event) => Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng)))
        .slice(0, 300);

      const zones = await Promise.all(
        sourceEvents.map(async (event) => {
          const key = `${event.lat},${event.lng},${event.confidence}`;
          const cached = predictionCacheRef.current.get(key);

          if (cached) {
            return {
              lat: Number(event.lat),
              lng: Number(event.lng),
              ...cached,
            };
          }

          try {
            const params = new URLSearchParams({
              lat: String(event.lat),
              lng: String(event.lng),
              confidence: String(event.confidence),
            });
            const response = await fetch(`http://127.0.0.1:8000/predict?${params.toString()}`);

            if (!response.ok) {
              return null;
            }

            const data = await response.json();
            const risk = predictionToRisk(Number(data.prediction));
            predictionCacheRef.current.set(key, risk);

            return {
              lat: Number(event.lat),
              lng: Number(event.lng),
              ...risk,
            };
          } catch (error) {
            return null;
          }
        })
      );

      if (!cancelled) {
        setPredictedRiskZones(zones.filter(Boolean));
      }
    };

    runPredictionLayer();

    return () => {
      cancelled = true;
    };
  }, [events, showPredictedRiskZones]);

  return (
    <div className="map-stage">
      <MapContainer
        center={[12.2958, 76.6394]}
        zoom={13}
        scrollWheelZoom
        className="urban-map"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <HeatOverlay points={heatPoints} />
        <LiveVehicle events={events} routeRequest={routeRequest} />

        {showPredictedRiskZones
          ? predictedRiskZones.map((zone, index) => (
            <CircleMarker
              key={`risk-${zone.lat}-${zone.lng}-${index}`}
              center={[zone.lat, zone.lng]}
              radius={7}
              pathOptions={{
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: 0.18,
                weight: 1,
              }}
            >
              <Popup>
                <b>Predicted Risk Zone</b>
                <br />
                {zone.label}
              </Popup>
            </CircleMarker>
          ))
          : null}

        {visibleEvents.map((event, i) => (
          <CircleMarker
            key={`${event.device_id ?? "device"}-${event.event_type}-${event.lat}-${event.lng}-${i}`}
            center={[event.lat, event.lng]}
            radius={4}
            pathOptions={{
              color: markerColor(event.event_type),
              fillColor: markerColor(event.event_type),
              fillOpacity: 0.82,
              weight: 2,
            }}
          >
            <Popup>
              <b>{event.event_type}</b>
              <br />
              Confidence: {Number(event.confidence).toFixed(2)}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
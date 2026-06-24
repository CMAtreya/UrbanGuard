import random
import time
from math import sqrt
import os
import sys

import requests

API_BASE = os.environ.get("URBANGUARD_API_BASE", "http://127.0.0.1:8002").rstrip("/")
URL = f"{API_BASE}/api/event"
HEALTH_URL = f"{API_BASE}/api/events"
MAX_STARTUP_RETRIES = int(os.environ.get("URBANGUARD_STARTUP_RETRIES", "30"))
RETRY_DELAY_SECONDS = float(os.environ.get("URBANGUARD_RETRY_DELAY_SECONDS", "2"))

# Actual road intersections and street segments in Bangalore.
# These are real coordinates on major roads, not random zones.
ROAD_INTERSECTIONS = [
    # MG Road & surrounding
    {"name": "MG Road - Brigade Road", "lat": 12.9352, "lng": 77.6012},
    {"name": "MG Road - Residency Road", "lat": 12.9341, "lng": 77.5998},
    {"name": "MG Road - Cubbon Road", "lat": 12.9312, "lng": 77.5987},
    
    # Whitefield
    {"name": "Whitefield Main Road - ISRO Layout", "lat": 12.9698, "lng": 77.7499},
    {"name": "Whitefield - Gachibowli", "lat": 12.9655, "lng": 77.7412},
    {"name": "Whitefield - Marathahalli", "lat": 12.9698, "lng": 77.6834},
    
    # Sarjapur Road
    {"name": "Sarjapur Road - Brookefield", "lat": 12.8242, "lng": 77.7382},
    {"name": "Sarjapur Road - Bellandur", "lat": 12.8312, "lng": 77.7245},
    {"name": "Sarjapur Road - Iblur", "lat": 12.8456, "lng": 77.7098},
    
    # Koramangala
    {"name": "Koramangala - Indiranagar Road", "lat": 12.9352, "lng": 77.6245},
    {"name": "Koramangala - CMH Road", "lat": 12.9298, "lng": 77.6312},
    {"name": "Koramangala - King Road", "lat": 12.9245, "lng": 77.6178},
    
    # Indiranagar
    {"name": "Indiranagar - 100 Feet Road", "lat": 12.3716, "lng": 77.6412},
    {"name": "Indiranagar - CMH Road", "lat": 12.3745, "lng": 77.6398},
    {"name": "Indiranagar - Munneswaram Road", "lat": 12.3812, "lng": 77.6445},
    
    # Electronic City
    {"name": "Electronic City - Phase 1", "lat": 12.8395, "lng": 77.6789},
    {"name": "Electronic City - Phase 2", "lat": 12.8456, "lng": 77.6834},
    {"name": "Electronic City - Attibele Road", "lat": 12.8312, "lng": 77.6945},
    
    # Silk Board
    {"name": "Silk Board - Kanakapura Road", "lat": 12.8447, "lng": 77.5863},
    {"name": "Silk Board - Revenue Office", "lat": 12.8512, "lng": 77.5798},
    {"name": "Silk Board - Bannerghatta Road", "lat": 12.8578, "lng": 77.5712},
    
    # Hebbal
    {"name": "Hebbal - Bangalore-Mysore Road", "lat": 13.0012, "lng": 77.5841},
    {"name": "Hebbal - Outer Ring Road", "lat": 13.0145, "lng": 77.5945},
    {"name": "Hebbal - Yelahanka Junction", "lat": 13.0234, "lng": 77.6012},
    
    # Airport Road
    {"name": "Airport Road - Ramprastha", "lat": 13.0678, "lng": 77.5812},
    {"name": "Airport Road - Domlur", "lat": 13.0412, "lng": 77.6145},
    {"name": "Airport Road - Bhoopathia Layout", "lat": 13.0234, "lng": 77.6298},
    
    # Cunningham Road
    {"name": "Cunningham Road - Mayo Hall", "lat": 12.9945, "lng": 77.5834},
    {"name": "Cunningham Road - Palace Road", "lat": 12.9878, "lng": 77.5912},
    
    # Outer Ring Road
    {"name": "ORR - Silk Board", "lat": 12.8734, "lng": 77.5645},
    {"name": "ORR - Marthahalli", "lat": 12.9567, "lng": 77.7234},
    {"name": "ORR - Vijaynagar", "lat": 12.9834, "lng": 77.6178},
]

# Keep a few pothole-prone spots active so the frontend sees repeated live alerts.
POTHOLE_HOTSPOTS = [
    {"name": "MG Road pothole cluster", "lat": 12.9352, "lng": 77.6012},
    {"name": "Koramangala pothole cluster", "lat": 12.9298, "lng": 77.6312},
    {"name": "Electronic City pothole cluster", "lat": 12.8395, "lng": 77.6789},
    {"name": "ORR pothole cluster", "lat": 12.9567, "lng": 77.7234},
    {"name": "Silk Board pothole cluster", "lat": 12.8447, "lng": 77.5863},
]


def build_event_payload():
    pothole_focus = random.random() < 0.78
    source = random.choice(POTHOLE_HOTSPOTS if pothole_focus else ROAD_INTERSECTIONS)

    # Keep potholes dense around a handful of road points so they appear as live hotspots.
    lat_noise = (random.random() - 0.5) * (0.00035 if pothole_focus else 0.001)
    lng_noise = (random.random() - 0.5) * (0.00035 if pothole_focus else 0.001)

    event_type = "pothole" if pothole_focus else random.choice(["crash", "speed_breaker"])
    confidence_floor = 0.86 if pothole_focus else 0.7

    base_ax = random.uniform(0.8, 2.5)
    base_ay = random.uniform(0.8, 2.5)
    base_az = random.uniform(0.8, 2.5)
    noise = random.uniform(0.1, 1.5)

    if event_type == "pothole":
        ax = base_ax + noise
        ay = base_ay + noise
        az = base_az + noise
    elif event_type == "crash":
        ax = base_ax + noise * 2
        ay = base_ay + noise * 2
        az = base_az + noise * 2
    else:
        ax = base_ax
        ay = base_ay
        az = base_az

    magnitude = sqrt(ax * ax + ay * ay + az * az)

    return {
        "source": source,
        "data": {
            "device_id": f"UG-{random.randint(1, 999):04d}",
            "event_type": event_type,
            "lat": round(source["lat"] + lat_noise, 6),
            "lng": round(source["lng"] + lng_noise, 6),
            "confidence": round(random.uniform(confidence_floor, 0.99), 2),
            "ax": round(ax, 2),
            "ay": round(ay, 2),
            "az": round(az, 2),
            "magnitude": round(magnitude, 2),
        },
    }


def wait_for_backend():
    for attempt in range(1, MAX_STARTUP_RETRIES + 1):
        try:
            response = requests.get(HEALTH_URL, timeout=5)
            response.raise_for_status()
            return
        except requests.RequestException:
            if attempt == MAX_STARTUP_RETRIES:
                print(
                    f"Backend is unavailable at {API_BASE}. Start it with `uvicorn main:app --reload --port 8002` "
                    f"or set URBANGUARD_API_BASE to the correct URL.",
                    file=sys.stderr,
                )
                raise SystemExit(1)

            time.sleep(RETRY_DELAY_SECONDS)

wait_for_backend()

while True:
    payload = build_event_payload()
    data = payload["data"]
    source = payload["source"]

    try:
        requests.post(URL, json=data, timeout=5)
        print(f"Sent: {source['name']} - {data}")
    except requests.RequestException as error:
        print(f"Backend unavailable while sending event: {error}", file=sys.stderr)
        wait_for_backend()
        continue

    time.sleep(2)
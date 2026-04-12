import requests
import random
import time

URL = "http://127.0.0.1:8000/api/event"

# Actual road intersections and street segments in Bangalore
# These are real coordinates on major roads, not random zones
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

while True:
    # Pick a random road intersection
    road = random.choice(ROAD_INTERSECTIONS)
    
    # Add small noise to exact intersection (±0.0005 degrees ≈ ±50 meters)
    lat = road["lat"] + (random.random() - 0.5) * 0.001
    lng = road["lng"] + (random.random() - 0.5) * 0.001
    
    data = {
        "device_id": f"UG-{random.randint(1, 999):04d}",
        "event_type": random.choice(["pothole", "crash", "speed_breaker"]),
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "confidence": round(random.uniform(0.7, 0.99), 2)
    }

    requests.post(URL, json=data)
    print(f"Sent: {road['name']} - {data}")

    time.sleep(2)
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::geometry::{
    fetch_overpass_road_data, latlon_to_enu, overpass_to_lane_metadata, RoadSpline,
};

const NOMINATIM_BASE: &str = "https://nominatim.openstreetmap.org";
const OSRM_BASE: &str = "https://router.project-osrm.org";
const USER_AGENT: &str = "VoiceDrive/0.1 (https://github.com/voicedrive)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteSummary {
    pub origin: String,
    pub destination: String,
    pub distance_km: f64,
    pub duration_min: f64,
    pub waypoint_count: usize,
    pub road_spline_length_m: f64,
    pub num_lanes: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnInstruction {
    pub distance_m: f64,
    pub duration_s: f64,
    pub instruction: String,
    pub modifier: Option<String>,
    pub maneuver_type: String,
    pub name: String,
    pub position: [f64; 2],
}

#[derive(Debug, Clone)]
pub struct CachedRoute {
    pub summary: RouteSummary,
    #[allow(dead_code)]
    pub polyline: Vec<(f64, f64)>,
    pub spline: RoadSpline,
    pub directions: Vec<TurnInstruction>,
}

pub struct RouteService {
    client: reqwest::Client,
    cache: Arc<RwLock<HashMap<String, CachedRoute>>>,
    active_route_key: Arc<RwLock<Option<String>>>,
}

impl RouteService {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client");

        Self {
            client,
            cache: Arc::new(RwLock::new(HashMap::new())),
            active_route_key: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn plan_route(
        &self,
        origin: &str,
        destination: &str,
    ) -> Result<RouteSummary, String> {
        let cache_key = format!("{origin}|{destination}");

        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(&cache_key) {
                let mut active = self.active_route_key.write().await;
                *active = Some(cache_key);
                return Ok(cached.summary.clone());
            }
        }

        let origin_coords = self.geocode(origin).await?;
        let dest_coords = self.geocode(destination).await?;

        let (polyline, distance_m, duration_s, steps) =
            self.osrm_route(origin_coords, dest_coords).await?;

        let ref_lat = (origin_coords.0 + dest_coords.0) / 2.0;
        let ref_lon = (origin_coords.1 + dest_coords.1) / 2.0;

        let enu_waypoints: Vec<[f64; 2]> = polyline
            .iter()
            .map(|&(lat, lon)| latlon_to_enu(lat, lon, ref_lat, ref_lon))
            .collect();

        let road_data = fetch_overpass_road_data(&self.client, &polyline)
            .await
            .unwrap_or_default();
        let lane_metadata = overpass_to_lane_metadata(&road_data, enu_waypoints.len());

        let spline = RoadSpline::from_enu_waypoints(&enu_waypoints, lane_metadata);

        let directions = steps
            .into_iter()
            .map(|s| TurnInstruction {
                distance_m: s.distance,
                duration_s: s.duration,
                instruction: s
                    .maneuver
                    .get("instruction")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                modifier: s
                    .maneuver
                    .get("modifier")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                maneuver_type: s
                    .maneuver
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                name: s.name,
                position: s
                    .maneuver
                    .get("location")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        let lon = arr.first().and_then(|v| v.as_f64()).unwrap_or(0.0);
                        let lat = arr.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
                        latlon_to_enu(lat, lon, ref_lat, ref_lon)
                    })
                    .unwrap_or([0.0, 0.0]),
            })
            .collect();

        let summary = RouteSummary {
            origin: origin.to_string(),
            destination: destination.to_string(),
            distance_km: distance_m / 1000.0,
            duration_min: duration_s / 60.0,
            waypoint_count: polyline.len(),
            road_spline_length_m: spline.total_length,
            num_lanes: spline.num_lanes,
        };

        let cached = CachedRoute {
            summary: summary.clone(),
            polyline,
            spline,
            directions,
        };

        {
            let mut cache = self.cache.write().await;
            cache.insert(cache_key.clone(), cached);
        }

        {
            let mut active = self.active_route_key.write().await;
            *active = Some(cache_key);
        }

        Ok(summary)
    }

    pub async fn get_geometry(&self) -> Result<RoadSpline, String> {
        let active = self.active_route_key.read().await;
        let key = active.as_ref().ok_or("no active route")?;
        let cache = self.cache.read().await;
        let cached = cache.get(key).ok_or("route not in cache")?;
        Ok(cached.spline.clone())
    }

    pub async fn get_directions(&self) -> Result<Vec<TurnInstruction>, String> {
        let active = self.active_route_key.read().await;
        let key = active.as_ref().ok_or("no active route")?;
        let cache = self.cache.read().await;
        let cached = cache.get(key).ok_or("route not in cache")?;
        Ok(cached.directions.clone())
    }

    #[allow(dead_code)]
    pub async fn get_active_spline(&self) -> Option<RoadSpline> {
        let active = self.active_route_key.read().await;
        let key = active.as_ref()?;
        let cache = self.cache.read().await;
        cache.get(key).map(|c| c.spline.clone())
    }

    async fn geocode(&self, address: &str) -> Result<(f64, f64), String> {
        let url = format!(
            "{NOMINATIM_BASE}/search?q={}&format=jsonv2&limit=1",
            urlencoding(address)
        );

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Nominatim request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("Nominatim returned status {}", resp.status()));
        }

        let body: Vec<NominatimResult> = resp
            .json()
            .await
            .map_err(|e| format!("Nominatim JSON parse failed: {e}"))?;

        let first = body
            .first()
            .ok_or_else(|| format!("No geocoding results for '{address}'"))?;

        let lat: f64 = first
            .lat
            .parse()
            .map_err(|_| "Invalid lat from Nominatim".to_string())?;
        let lon: f64 = first
            .lon
            .parse()
            .map_err(|_| "Invalid lon from Nominatim".to_string())?;

        Ok((lat, lon))
    }

    async fn osrm_route(
        &self,
        origin: (f64, f64),
        destination: (f64, f64),
    ) -> Result<(Vec<(f64, f64)>, f64, f64, Vec<OsrmStep>), String> {
        let url = format!(
            "{OSRM_BASE}/route/v1/driving/{},{};{},{}?overview=full&geometries=geojson&steps=true",
            origin.1, origin.0, destination.1, destination.0
        );

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("OSRM request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("OSRM returned status {}", resp.status()));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("OSRM JSON parse failed: {e}"))?;

        let route = body["routes"]
            .as_array()
            .and_then(|r| r.first())
            .ok_or("No routes returned by OSRM")?;

        let distance = route["distance"].as_f64().unwrap_or(0.0);
        let duration = route["duration"].as_f64().unwrap_or(0.0);

        let coords = route["geometry"]["coordinates"]
            .as_array()
            .ok_or("Missing geometry coordinates")?;

        let polyline: Vec<(f64, f64)> = coords
            .iter()
            .filter_map(|c| {
                let arr = c.as_array()?;
                let lon = arr.first()?.as_f64()?;
                let lat = arr.get(1)?.as_f64()?;
                Some((lat, lon))
            })
            .collect();

        let mut steps = Vec::new();
        if let Some(legs) = route["legs"].as_array() {
            for leg in legs {
                if let Some(leg_steps) = leg["steps"].as_array() {
                    for step in leg_steps {
                        let name = step["name"].as_str().unwrap_or("").to_string();
                        let step_distance = step["distance"].as_f64().unwrap_or(0.0);
                        let step_duration = step["duration"].as_f64().unwrap_or(0.0);
                        let maneuver = step["maneuver"].clone();

                        steps.push(OsrmStep {
                            name,
                            distance: step_distance,
                            duration: step_duration,
                            maneuver,
                        });
                    }
                }
            }
        }

        Ok((polyline, distance, duration, steps))
    }
}

fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                String::from(b as char)
            }
            b' ' => "+".to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct NominatimResult {
    lat: String,
    lon: String,
}

#[derive(Debug)]
struct OsrmStep {
    name: String,
    distance: f64,
    duration: f64,
    maneuver: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencoding_spaces() {
        let encoded = urlencoding("Stanford University");
        assert!(encoded.contains('+') || encoded.contains("%20"));
        assert!(!encoded.contains(' '));
    }

    #[test]
    fn urlencoding_special_chars() {
        let encoded = urlencoding("foo&bar=baz");
        assert!(!encoded.contains('&'));
        assert!(!encoded.contains('='));
    }

    #[test]
    fn route_service_creates() {
        let _service = RouteService::new();
    }

    #[tokio::test]
    async fn cache_returns_none_for_no_active_route() {
        let service = RouteService::new();
        let result = service.get_active_spline().await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn geometry_fails_without_active_route() {
        let service = RouteService::new();
        let result = service.get_geometry().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn directions_fails_without_active_route() {
        let service = RouteService::new();
        let result = service.get_directions().await;
        assert!(result.is_err());
    }
}

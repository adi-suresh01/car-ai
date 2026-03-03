use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

use crate::config::LANE_WIDTH_METERS;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplinePoint {
    pub x: f64,
    pub z: f64,
    pub s: f64,
    pub heading: f64,
    pub curvature: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneMetadata {
    pub lane_count: u8,
    pub speed_limit_mps: Option<f64>,
    pub road_width_m: Option<f64>,
}

impl Default for LaneMetadata {
    fn default() -> Self {
        Self {
            lane_count: 2,
            speed_limit_mps: None,
            road_width_m: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoadSpline {
    pub control_points: Vec<[f64; 2]>,
    pub sampled_points: Vec<SplinePoint>,
    pub total_length: f64,
    pub lane_metadata: Vec<LaneMetadata>,
    pub num_lanes: u8,
}

impl RoadSpline {
    pub fn from_enu_waypoints(waypoints: &[[f64; 2]], lane_meta: Vec<LaneMetadata>) -> Self {
        if waypoints.len() < 2 {
            return Self {
                control_points: waypoints.to_vec(),
                sampled_points: Vec::new(),
                total_length: 0.0,
                lane_metadata: lane_meta,
                num_lanes: 2,
            };
        }

        let num_lanes = lane_meta
            .iter()
            .map(|m| m.lane_count)
            .max()
            .unwrap_or(2);

        let sampled = catmull_rom_sample(waypoints, 1.0);

        let mut arc_points = Vec::with_capacity(sampled.len());
        let mut s_accum = 0.0;

        for i in 0..sampled.len() {
            let (heading, curvature) = if sampled.len() < 2 {
                (0.0, 0.0)
            } else if i == 0 {
                let dx = sampled[1][0] - sampled[0][0];
                let dz = sampled[1][1] - sampled[0][1];
                (dz.atan2(dx), 0.0)
            } else {
                let dx = sampled[i][0] - sampled[i - 1][0];
                let dz = sampled[i][1] - sampled[i - 1][1];
                let dist = (dx * dx + dz * dz).sqrt();
                s_accum += dist;

                let heading = dz.atan2(dx);
                let curvature = if i >= 2 {
                    compute_curvature(&sampled[i - 2], &sampled[i - 1], &sampled[i])
                } else {
                    0.0
                };

                (heading, curvature)
            };

            arc_points.push(SplinePoint {
                x: sampled[i][0],
                z: sampled[i][1],
                s: s_accum,
                heading,
                curvature,
            });
        }

        Self {
            control_points: waypoints.to_vec(),
            sampled_points: arc_points,
            total_length: s_accum,
            lane_metadata: lane_meta,
            num_lanes,
        }
    }

    pub fn sample_at_s(&self, s: f64) -> Option<SplinePoint> {
        if self.sampled_points.is_empty() {
            return None;
        }

        let s_clamped = s.clamp(0.0, self.total_length);

        let idx = match self
            .sampled_points
            .binary_search_by(|p| p.s.partial_cmp(&s_clamped).unwrap_or(std::cmp::Ordering::Equal))
        {
            Ok(i) => return Some(self.sampled_points[i].clone()),
            Err(i) => i,
        };

        if idx == 0 {
            return Some(self.sampled_points[0].clone());
        }
        if idx >= self.sampled_points.len() {
            return Some(self.sampled_points.last().unwrap().clone());
        }

        let a = &self.sampled_points[idx - 1];
        let b = &self.sampled_points[idx];
        let ds = b.s - a.s;
        if ds < 1e-12 {
            return Some(a.clone());
        }

        let t = (s_clamped - a.s) / ds;
        Some(SplinePoint {
            x: a.x + t * (b.x - a.x),
            z: a.z + t * (b.z - a.z),
            s: s_clamped,
            heading: lerp_angle(a.heading, b.heading, t),
            curvature: a.curvature + t * (b.curvature - a.curvature),
        })
    }

    #[allow(dead_code)]
    pub fn world_position(&self, s: f64, lateral_t: f64) -> Option<(f64, f64, f64)> {
        let point = self.sample_at_s(s)?;
        let normal_x = -point.heading.sin();
        let normal_z = point.heading.cos();

        Some((
            point.x + lateral_t * normal_x,
            point.z + lateral_t * normal_z,
            point.heading,
        ))
    }

    pub fn lane_offset(&self, lane_index: usize) -> f64 {
        let half_road = (self.num_lanes as f64) * LANE_WIDTH_METERS / 2.0;
        (lane_index as f64 + 0.5) * LANE_WIDTH_METERS - half_road
    }

    #[allow(dead_code)]
    pub fn closest_s(&self, world_x: f64, world_z: f64) -> f64 {
        if self.sampled_points.is_empty() {
            return 0.0;
        }

        let mut best_s = 0.0;
        let mut best_dist_sq = f64::MAX;

        for pt in &self.sampled_points {
            let dx = world_x - pt.x;
            let dz = world_z - pt.z;
            let dist_sq = dx * dx + dz * dz;
            if dist_sq < best_dist_sq {
                best_dist_sq = dist_sq;
                best_s = pt.s;
            }
        }

        best_s
    }

    pub fn closest_lane(&self, lateral_t: f64) -> usize {
        let half_road = (self.num_lanes as f64) * LANE_WIDTH_METERS / 2.0;
        let lane_f = ((lateral_t + half_road) / LANE_WIDTH_METERS - 0.5).round();
        (lane_f.max(0.0) as usize).min((self.num_lanes as usize).saturating_sub(1))
    }
}

fn catmull_rom_sample(points: &[[f64; 2]], sample_spacing: f64) -> Vec<[f64; 2]> {
    if points.len() < 2 {
        return points.to_vec();
    }

    let mut result = Vec::new();

    let n = points.len();
    for seg in 0..n - 1 {
        let p0 = if seg == 0 { points[0] } else { points[seg - 1] };
        let p1 = points[seg];
        let p2 = points[seg + 1];
        let p3 = if seg + 2 < n {
            points[seg + 2]
        } else {
            points[n - 1]
        };

        let chord = ((p2[0] - p1[0]).powi(2) + (p2[1] - p1[1]).powi(2)).sqrt();
        let num_samples = (chord / sample_spacing).ceil().max(1.0) as usize;

        for j in 0..num_samples {
            let t = j as f64 / num_samples as f64;
            let x = catmull_rom_interp(p0[0], p1[0], p2[0], p3[0], t);
            let z = catmull_rom_interp(p0[1], p1[1], p2[1], p3[1], t);
            result.push([x, z]);
        }
    }

    result.push(*points.last().unwrap());
    result
}

fn catmull_rom_interp(p0: f64, p1: f64, p2: f64, p3: f64, t: f64) -> f64 {
    let t2 = t * t;
    let t3 = t2 * t;
    0.5 * ((2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)
}

fn compute_curvature(a: &[f64; 2], b: &[f64; 2], c: &[f64; 2]) -> f64 {
    let d1x = b[0] - a[0];
    let d1z = b[1] - a[1];
    let d2x = c[0] - b[0];
    let d2z = c[1] - b[1];

    let cross = d1x * d2z - d1z * d2x;
    let len1 = (d1x * d1x + d1z * d1z).sqrt();
    let len2 = (d2x * d2x + d2z * d2z).sqrt();
    let avg_len = (len1 + len2) / 2.0;

    if avg_len < 1e-12 {
        0.0
    } else {
        cross / (avg_len * avg_len * avg_len)
    }
}

fn lerp_angle(a: f64, b: f64, t: f64) -> f64 {
    let mut diff = b - a;
    while diff > PI {
        diff -= 2.0 * PI;
    }
    while diff < -PI {
        diff += 2.0 * PI;
    }
    a + diff * t
}

pub fn latlon_to_enu(lat: f64, lon: f64, ref_lat: f64, ref_lon: f64) -> [f64; 2] {
    let ref_lat_rad = ref_lat.to_radians();

    let meters_per_deg_lat = 111_320.0;
    let meters_per_deg_lon = 111_320.0 * ref_lat_rad.cos();

    let east = (lon - ref_lon) * meters_per_deg_lon;
    let north = (lat - ref_lat) * meters_per_deg_lat;

    [east, north]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverpassRoadData {
    pub lane_count: Option<u8>,
    pub speed_limit_kmh: Option<f64>,
    pub road_width_m: Option<f64>,
    pub highway_type: String,
}

pub async fn fetch_overpass_road_data(
    client: &reqwest::Client,
    polyline: &[(f64, f64)],
) -> Result<Vec<OverpassRoadData>, String> {
    if polyline.is_empty() {
        return Ok(Vec::new());
    }

    let (min_lat, max_lat, min_lon, max_lon) = polyline.iter().fold(
        (f64::MAX, f64::MIN, f64::MAX, f64::MIN),
        |(min_lat, max_lat, min_lon, max_lon), &(lat, lon)| {
            (
                min_lat.min(lat),
                max_lat.max(lat),
                min_lon.min(lon),
                max_lon.max(lon),
            )
        },
    );

    let margin = 0.001;
    let bbox = format!(
        "{},{},{},{}",
        min_lat - margin,
        min_lon - margin,
        max_lat + margin,
        max_lon + margin
    );

    let query = format!(
        r#"[out:json][timeout:25];
way["highway"~"motorway|trunk|primary|secondary|tertiary"]({bbox});
out tags;"#
    );

    let resp = client
        .post("https://overpass-api.de/api/interpreter")
        .form(&[("data", &query)])
        .send()
        .await
        .map_err(|e| format!("Overpass request failed: {e}"))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Overpass JSON parse failed: {e}"))?;

    let elements = body["elements"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let mut results = Vec::new();
    for elem in elements {
        let tags = &elem["tags"];
        let highway_type = tags["highway"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        let lane_count = tags["lanes"]
            .as_str()
            .and_then(|s| s.parse::<u8>().ok());

        let speed_limit_kmh = tags["maxspeed"]
            .as_str()
            .and_then(|s| {
                s.replace(" mph", "")
                    .replace(" km/h", "")
                    .trim()
                    .parse::<f64>()
                    .ok()
            });

        let road_width_m = tags["width"]
            .as_str()
            .and_then(|s| s.trim().parse::<f64>().ok());

        results.push(OverpassRoadData {
            lane_count,
            speed_limit_kmh,
            road_width_m,
            highway_type,
        });
    }

    Ok(results)
}

pub fn overpass_to_lane_metadata(road_data: &[OverpassRoadData], num_waypoints: usize) -> Vec<LaneMetadata> {
    if road_data.is_empty() {
        return vec![LaneMetadata::default(); num_waypoints];
    }

    let avg_lanes = road_data
        .iter()
        .filter_map(|r| r.lane_count)
        .map(|l| l as f64)
        .sum::<f64>();
    let lane_count_entries = road_data
        .iter()
        .filter(|r| r.lane_count.is_some())
        .count();
    let avg_lanes = if lane_count_entries > 0 {
        (avg_lanes / lane_count_entries as f64).round() as u8
    } else {
        2
    };

    let avg_speed = road_data
        .iter()
        .filter_map(|r| r.speed_limit_kmh)
        .sum::<f64>();
    let speed_count = road_data
        .iter()
        .filter(|r| r.speed_limit_kmh.is_some())
        .count();
    let speed_limit_mps = if speed_count > 0 {
        Some(avg_speed / speed_count as f64 / 3.6)
    } else {
        None
    };

    vec![
        LaneMetadata {
            lane_count: avg_lanes.max(1),
            speed_limit_mps,
            road_width_m: None,
        };
        num_waypoints
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catmull_rom_interp_endpoints() {
        let val = catmull_rom_interp(0.0, 1.0, 2.0, 3.0, 0.0);
        assert!((val - 1.0).abs() < 1e-9, "t=0 should give p1");
        let val = catmull_rom_interp(0.0, 1.0, 2.0, 3.0, 1.0);
        assert!((val - 2.0).abs() < 1e-9, "t=1 should give p2");
    }

    #[test]
    fn enu_conversion_origin_is_zero() {
        let [e, n] = latlon_to_enu(37.0, -122.0, 37.0, -122.0);
        assert!(e.abs() < 1e-6);
        assert!(n.abs() < 1e-6);
    }

    #[test]
    fn enu_conversion_north_positive() {
        let [_e, n] = latlon_to_enu(38.0, -122.0, 37.0, -122.0);
        assert!(n > 0.0, "moving north should give positive north component");
    }

    #[test]
    fn road_spline_from_straight_line() {
        let waypoints = vec![[0.0, 0.0], [0.0, 100.0], [0.0, 200.0]];
        let meta = vec![LaneMetadata::default(); 3];
        let spline = RoadSpline::from_enu_waypoints(&waypoints, meta);

        assert!(spline.total_length > 190.0, "straight line of 200m");
        assert!(!spline.sampled_points.is_empty());
    }

    #[test]
    fn sample_at_s_returns_endpoints() {
        let waypoints = vec![[0.0, 0.0], [100.0, 0.0], [200.0, 0.0]];
        let meta = vec![LaneMetadata::default(); 3];
        let spline = RoadSpline::from_enu_waypoints(&waypoints, meta);

        let start = spline.sample_at_s(0.0).unwrap();
        assert!(start.s.abs() < 1e-6);

        let end = spline.sample_at_s(spline.total_length).unwrap();
        assert!((end.s - spline.total_length).abs() < 1e-6);
    }

    #[test]
    fn world_position_centerline_matches_spline() {
        let waypoints = vec![[0.0, 0.0], [0.0, 50.0], [0.0, 100.0]];
        let meta = vec![LaneMetadata::default(); 3];
        let spline = RoadSpline::from_enu_waypoints(&waypoints, meta);

        let (x, z, _heading) = spline.world_position(10.0, 0.0).unwrap();
        assert!(x.abs() < 2.0, "centerline x should be near 0, got {x}");
        assert!(z > 0.0, "z should be positive along the route");
    }

    #[test]
    fn lane_offset_symmetric() {
        let waypoints = vec![[0.0, 0.0], [0.0, 100.0]];
        let meta = vec![LaneMetadata {
            lane_count: 4,
            speed_limit_mps: None,
            road_width_m: None,
        }];
        let spline = RoadSpline::from_enu_waypoints(&waypoints, meta);

        let left = spline.lane_offset(0);
        let right = spline.lane_offset(3);
        assert!((left + right).abs() < 1e-9, "lanes should be symmetric about center");
    }

    #[test]
    fn closest_lane_roundtrip() {
        let waypoints = vec![[0.0, 0.0], [0.0, 100.0]];
        let meta = vec![LaneMetadata {
            lane_count: 4,
            speed_limit_mps: None,
            road_width_m: None,
        }];
        let spline = RoadSpline::from_enu_waypoints(&waypoints, meta);

        for lane in 0..4 {
            let offset = spline.lane_offset(lane);
            let recovered = spline.closest_lane(offset);
            assert_eq!(recovered, lane, "lane offset -> closest_lane should roundtrip");
        }
    }

    #[test]
    fn closest_s_finds_nearest_point() {
        let waypoints = vec![[0.0, 0.0], [100.0, 0.0], [200.0, 0.0]];
        let meta = vec![LaneMetadata::default(); 3];
        let spline = RoadSpline::from_enu_waypoints(&waypoints, meta);

        let s = spline.closest_s(50.0, 0.0);
        assert!(s > 0.0 && s < spline.total_length, "should find point in middle");
    }

    #[test]
    fn lerp_angle_wraps_correctly() {
        let result = lerp_angle(-PI + 0.1, PI - 0.1, 0.5);
        assert!(result.abs() > PI - 0.5, "should interpolate through PI boundary");
    }

    #[test]
    fn compute_curvature_straight_line() {
        let a = [0.0, 0.0];
        let b = [0.0, 10.0];
        let c = [0.0, 20.0];
        let curv = compute_curvature(&a, &b, &c);
        assert!(curv.abs() < 1e-9, "straight line should have zero curvature");
    }

    #[test]
    fn overpass_to_lane_metadata_default() {
        let result = overpass_to_lane_metadata(&[], 5);
        assert_eq!(result.len(), 5);
        for m in &result {
            assert_eq!(m.lane_count, 2);
        }
    }
}

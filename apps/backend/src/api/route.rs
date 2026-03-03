use actix_web::{web, HttpResponse};
use serde::Deserialize;

use crate::route::service::RouteService;

#[derive(Debug, Deserialize)]
pub struct RoutePlanRequest {
    pub origin: String,
    pub destination: String,
}

pub async fn post_route_plan(
    body: web::Json<RoutePlanRequest>,
    route_service: web::Data<RouteService>,
) -> HttpResponse {
    match route_service.plan_route(&body.origin, &body.destination).await {
        Ok(summary) => HttpResponse::Ok().json(summary),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

pub async fn get_route_geometry(
    route_service: web::Data<RouteService>,
) -> HttpResponse {
    match route_service.get_geometry().await {
        Ok(spline) => HttpResponse::Ok().json(spline),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

pub async fn get_route_directions(
    route_service: web::Data<RouteService>,
) -> HttpResponse {
    match route_service.get_directions().await {
        Ok(directions) => HttpResponse::Ok().json(directions),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

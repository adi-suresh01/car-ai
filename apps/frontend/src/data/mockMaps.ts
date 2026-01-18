export interface MapReport {
  id: string;
  type: "police" | "hazard" | "traffic" | "closure" | "camera";
  distanceMiles: number;
  description: string;
}

export const mockReports: MapReport[] = [
  { id: "r-101", type: "traffic", distanceMiles: 2.3, description: "Slowdown near Exit 435 · 4 min delay." },
  { id: "r-102", type: "police", distanceMiles: 6.2, description: "Patrol vehicle on shoulder." },
  { id: "r-103", type: "hazard", distanceMiles: 3.8, description: "Debris in right lane." },
  { id: "r-104", type: "camera", distanceMiles: 5.1, description: "Speed camera ahead." },
  { id: "r-105", type: "closure", distanceMiles: 9.4, description: "Ramp closure ahead." },
];

export const mockPlaces = [
  { id: "p-201", type: "charging", name: "ElectraCharge Station", distanceMiles: 4.6 },
  { id: "p-202", type: "coffee", name: "Coastal Coffee", distanceMiles: 3.2 },
  { id: "p-203", type: "rest", name: "Vista Rest Area", distanceMiles: 8.1 },
];

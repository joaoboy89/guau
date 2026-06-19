export type WalkStatus =
  | "PENDING"
  | "CONFIRMED"
  | "WALKER_ON_WAY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_OWNER"
  | "CANCELLED_WALKER";

export type WalkMode = "GRUPAL" | "EXCLUSIVO";

export interface WalkType {
  id: string;
  durationMinutes: number;
  label: string;
  basePrice: number;
  exclusiveMultiplier: number;
}

export interface Walk {
  id: string;
  walkTypeId: string;
  walkerId: string;
  mode: WalkMode;
  status: WalkStatus;
  scheduledAt: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  totalAmount: number;
  commissionRate: number;
}

export interface WalkLocation {
  lat: number;
  lng: number;
  recordedAt: string;
}

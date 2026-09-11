import api from "@/lib/api";
import type { VerificationStatus, VerifyAction } from "./walker-status";

// Cliente de la API del panel de verificación de paseadores (rebanada 1).
// Mismo criterio que lib/support/api.ts: tipos y métodos propios acá adentro,
// no en lib/api.ts — el día que este panel se separe, esta carpeta se muda
// entera y no deja nada pegado en el archivo compartido.

export interface AdminListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminWalkerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
}

export interface AdminWalkerRow {
  id: string;
  userId: string;
  bio: string | null;
  rating: number;
  totalReviews: number;
  isAvailable: boolean;
  maxDogsPerWalk: number;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  verificationStatus: VerificationStatus;
  verificationNotes: string | null;
  verificationMethod: "PERSONAL" | "DOCUMENT" | "SID" | "DIDIT" | null;
  verifiedAt: string | null;
  verifiedById: string | null;
  user: AdminWalkerUser;
}

export interface AdminWalkersQuery {
  status: VerificationStatus;
  page?: number;
  limit?: number;
}

export interface AdminWalkersResponse {
  data: AdminWalkerRow[];
  meta: AdminListMeta;
}

export interface VerifyWalkerPayload {
  action: VerifyAction;
  notes?: string;
}

export const adminWalkersAPI = {
  getWalkers: (params: AdminWalkersQuery) =>
    api.get<AdminWalkersResponse>("/admin/walkers", { params }),
  verifyWalker: (id: string, payload: VerifyWalkerPayload) =>
    api.put<AdminWalkerRow>(`/admin/walkers/${id}/verify`, payload),
};

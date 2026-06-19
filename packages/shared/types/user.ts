export type UserRole = "OWNER" | "WALKER" | "ADMIN";
export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface UserBase {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface OwnerProfile {
  id: string;
  userId: string;
  address?: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
}

export interface WalkerProfile {
  id: string;
  userId: string;
  bio?: string;
  verificationStatus: VerificationStatus;
  rating: number;
  totalReviews: number;
  isAvailable: boolean;
  maxDogsPerWalk: number;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
}

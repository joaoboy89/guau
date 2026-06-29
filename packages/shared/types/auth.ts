export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterOwnerDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface RegisterWalkerDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  bio?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Axios instance con JWT refresh automático.
 * - Interceptor de request: adjunta access_token del localStorage
 * - Interceptor de response: si 401, intenta refresh y reintenta la request original
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Request interceptor ──────────────────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ─── Response interceptor (auto-refresh con cola) ────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers!.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;

      if (!refreshToken) {
        isRefreshing = false;
        processQueue(error, null);
        if (typeof window !== "undefined") {
          localStorage.clear();
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const newToken: string = data.access_token;
        localStorage.setItem("access_token", newToken);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }

        api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
        processQueue(null, newToken);

        originalRequest.headers!.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof window !== "undefined") {
          localStorage.clear();
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// ─── Typed API helpers ────────────────────────────────────────────────────────
export const authAPI = {
  loginOwner:     (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  registerOwner:  (data: unknown) => api.post("/auth/register/owner", data),
  registerWalker: (data: unknown) => api.post("/auth/register/walker", data),
  logout:         ()              => api.post("/auth/logout"),
};

export const ownersAPI = {
  me:     ()             => api.get("/owners/me"),
  update: (data: unknown) => api.put("/owners/me", data),
};

export const walkersAPI = {
  list:               (params?: Record<string, unknown>) => api.get("/walkers", { params }),
  getById:            (id: string)   => api.get(`/walkers/${id}`),
  myProfile:          ()             => api.get("/walkers/me/profile"),
  updateProfile:      (data: unknown) => api.put("/walkers/me/profile", data),
  updateAvailability: (data: unknown) => api.put("/walkers/me/availability", data),
};

export const dogsAPI = {
  list:   ()                          => api.get("/dogs"),
  create: (data: unknown)             => api.post("/dogs", data),
  update: (id: string, data: unknown) => api.put(`/dogs/${id}`, data),
  remove: (id: string)                => api.delete(`/dogs/${id}`),
};

export const walksAPI = {
  create:    (data: unknown) => api.post("/walks", data),
  list:      ()              => api.get("/walks"),
  getById:   (id: string)    => api.get(`/walks/${id}`),
  locations: (id: string)    => api.get(`/walks/${id}/locations`),
  confirm:   (id: string)    => api.put(`/walks/${id}/confirm`),
  reject:    (id: string)    => api.put(`/walks/${id}/reject`),
  start:     (id: string)    => api.put(`/walks/${id}/start`),
  finish:    (id: string)    => api.put(`/walks/${id}/finish`),
  cancel:    (id: string)    => api.put(`/walks/${id}/cancel`),
};

export const reviewsAPI = {
  create:   (data: unknown) => api.post("/reviews", data),
  byWalker: (id: string)    => api.get(`/reviews/walker/${id}`),
};

export const paymentsAPI = {
  createPreference: (data: unknown) => api.post("/payments/create-preference", data),
  walkerBalance:    ()              => api.get("/payments/walker-balance"),
};

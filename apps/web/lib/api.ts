import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from "axios";
import { navigateTo } from "./navigate";
import type { Notification } from "./store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const api: AxiosInstance = axios.create({
  baseURL:         API_URL,
  timeout:         30_000,
  headers:         { "Content-Type": "application/json" },
  withCredentials: true,
});

// ─── Response interceptor (401 → refresh con cookie) ─────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject:  (err: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else       p.resolve();
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes("/auth/me")) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Cookie de refresh viaja sola con withCredentials
        await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          navigateTo("/login");
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
  me:             ()              => api.get("/auth/me"),
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
  setZone:            (data: { centerLat: number; centerLng: number; radiusKm: number }) =>
                        api.post("/walkers/me/zone", data),
  createSchedule:     (data: { dayOfWeek: number; startTime: string; endTime: string }) =>
                        api.post("/walkers/me/schedules", data),
  updateSchedule:     (scheduleId: string, data: { startTime?: string; endTime?: string; isActive?: boolean }) =>
                        api.put(`/walkers/me/schedules/${scheduleId}`, data),
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
  cancel:    (id: string, data?: { cancellationReason?: string }) =>
                          api.put(`/walks/${id}/cancel`, data ?? {}),
};

export const reviewsAPI = {
  create:   (data: unknown) => api.post("/reviews", data),
  byWalker: (id: string)    => api.get(`/reviews/walker/${id}`),
};

export const walkTypesAPI = {
  list: () => api.get("/walk-types"),
};

export const paymentsAPI = {
  createPreference: (data: unknown) => api.post("/payments/create-preference", data),
  walkerBalance:    ()              => api.get("/payments/walker-balance"),
  walkerConnect:    ()              => api.get<{ url: string }>("/payments/walker-connect"),
};

export const notificationsAPI = {
  list:     ()           => api.get<Notification[]>("/notifications"),
  markRead: (id: string) => api.put<Notification>(`/notifications/${id}/read`),
};

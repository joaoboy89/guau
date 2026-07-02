/**
 * Regression tests para el interceptor 401 de lib/api.ts.
 *
 * Cubre el bug donde un 401 en /auth/me disparaba un refresh innecesario
 * que terminaba en un loop de recarga infinita en la pantalla de login.
 */

// Debe ir antes de los imports para que jest lo hoiste correctamente
jest.mock("./navigate", () => ({ navigateTo: jest.fn() }));

import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import api from "./api";
import { navigateTo } from "./navigate";

const API_URL = "http://localhost:3001";

// mockApi intercepta la instancia personalizada (todos los endpoints de la app)
const mockApi = new MockAdapter(api);
// mockAxios intercepta el axios base (usado en el interceptor para POST /auth/refresh)
const mockAxios = new MockAdapter(axios);

beforeEach(() => {
  mockApi.reset();
  mockAxios.reset();
  (navigateTo as jest.Mock).mockClear();
});

afterAll(() => {
  mockApi.restore();
  mockAxios.restore();
});

// ─── 1. /auth/me bypass ───────────────────────────────────────────────────────

describe("interceptor 401 — /auth/me", () => {
  it("propaga el 401 directo al caller sin llamar a /auth/refresh", async () => {
    mockApi.onGet("/auth/me").reply(401);

    await expect(api.get("/auth/me")).rejects.toMatchObject({
      response: { status: 401 },
    });

    // El interceptor debe haber hecho early-return; refresh nunca se llama
    expect(mockAxios.history["post"]).toHaveLength(0);
  });
});

// ─── 2. Endpoint protegido normal ────────────────────────────────────────────

describe("interceptor 401 — endpoint protegido", () => {
  it("llama a /auth/refresh y reintenta la request original si el refresh ok", async () => {
    // Primera llamada → 401; reintento tras refresh → 200
    mockApi.onGet("/dogs").replyOnce(401).onGet("/dogs").reply(200, []);
    mockAxios.onPost(`${API_URL}/auth/refresh`).reply(200);

    const res = await api.get("/dogs");

    expect(res.status).toBe(200);
    expect(mockAxios.history["post"]).toHaveLength(1);
    expect(mockAxios.history["post"][0].url).toBe(`${API_URL}/auth/refresh`);
  });
});

// ─── 3. Guard de redirect: comportamiento al fallar el refresh ────────────────
//
// api.ts delega la navegación a navigate.navigateTo(), que en tests está
// mockeado con jest.mock("./navigate"). jsdom 26 no permite espiar
// window.location directamente, pero sí podemos interceptar el módulo.
// window.history.replaceState sí cambia window.location.pathname en jsdom.
//
// Test 3a: fuera de /login → navigateTo("/login") es llamado
// Test 3b: ya en /login   → navigateTo NO es llamado (guard pathname !== "/login")

describe("interceptor 401 — guard de redirect", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("llama a navigateTo('/login') cuando el refresh falla y no estamos en /login", async () => {
    window.history.replaceState({}, "", "/owner/dogs");

    mockApi.onGet("/dogs").replyOnce(401);
    mockAxios.onPost(`${API_URL}/auth/refresh`).replyOnce(401);

    await expect(api.get("/dogs")).rejects.toBeDefined();

    expect(navigateTo).toHaveBeenCalledWith("/login");
  });

  it("no llama a navigateTo cuando ya estamos en /login", async () => {
    window.history.replaceState({}, "", "/login");

    mockApi.onGet("/dogs").replyOnce(401);
    mockAxios.onPost(`${API_URL}/auth/refresh`).replyOnce(401);

    await expect(api.get("/dogs")).rejects.toBeDefined();

    expect(navigateTo).not.toHaveBeenCalled();
  });
});

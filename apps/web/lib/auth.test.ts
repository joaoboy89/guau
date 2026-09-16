import { AxiosError } from "axios";
import { classifyAuthMeError } from "./auth";

function buildAxiosError(status?: number): AxiosError {
  const err = new Error("request failed") as AxiosError;
  err.isAxiosError = true;
  if (status !== undefined) {
    err.response = { status, data: {}, statusText: "", headers: {}, config: {} as never };
  }
  return err;
}

describe("classifyAuthMeError", () => {
  it("401: el unico caso que manda a login", () => {
    expect(classifyAuthMeError(buildAxiosError(401))).toEqual({ action: "login" });
  });

  it("sin status (la request no llego — red, timeout, CORS): NO es login, es un error para mostrar", () => {
    const result = classifyAuthMeError(buildAxiosError(undefined));
    expect(result.action).toBe("show-error");
    if (result.action === "show-error") {
      expect(result.reason).toBe("no-response");
      expect(result.message).not.toMatch(/sesion|logueado/i);
    }
  });

  it("429 del throttler: NO es login — redirigir borraria la sesion de alguien que si esta logueado", () => {
    const result = classifyAuthMeError(buildAxiosError(429));
    expect(result.action).toBe("show-error");
    if (result.action === "show-error") {
      expect(result.reason).toBe("status-429");
      expect(result.message).toContain("429");
    }
  });

  it("500: NO es login", () => {
    const result = classifyAuthMeError(buildAxiosError(500));
    expect(result.action).toBe("show-error");
    if (result.action === "show-error") {
      expect(result.reason).toBe("status-500");
    }
  });

  it("503 (caida temporal): NO es login", () => {
    const result = classifyAuthMeError(buildAxiosError(503));
    expect(result.action).toBe("show-error");
    if (result.action === "show-error") {
      expect(result.reason).toBe("status-503");
    }
  });

  it("un error que no es de axios (sin .response): se trata igual que sin status — no login", () => {
    const result = classifyAuthMeError(new Error("algo raro"));
    expect(result.action).toBe("show-error");
    if (result.action === "show-error") {
      expect(result.reason).toBe("no-response");
    }
  });
});

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AuthErrorState } from "./AuthErrorState";

// Primera vez que este proyecto renderiza un componente en vez de testear
// solo funciones puras — justificado acá porque las nueve pantallas que
// usan useRequireAuth() van a renderizar EXACTAMENTE este mismo componente
// de la misma forma (if (error) return <AuthErrorState .../>), asi que
// probarlo una vez cubre el comportamiento de las nueve.
describe("AuthErrorState", () => {
  it("muestra el mensaje recibido", () => {
    render(<AuthErrorState message="No pudimos conectar con el servidor." />);
    expect(screen.getByText("No pudimos conectar con el servidor.")).toBeInTheDocument();
  });

  it("NO muestra un spinner — es el reemplazo del spinner eterno, no otro spinner", () => {
    render(<AuthErrorState message="Ocurrió un error (429)." />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tiene un boton para reintentar", () => {
    render(<AuthErrorState message="Ocurrió un error (500)." />);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });
});

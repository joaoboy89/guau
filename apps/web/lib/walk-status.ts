export const STATUS_LABEL: Record<string, string> = {
  PENDING:          "Pendiente de confirmación",
  CONFIRMED:        "Confirmado",
  WALKER_ON_WAY:    "Paseador en camino",
  IN_PROGRESS:      "Paseo en curso",
  COMPLETED:        "Completado",
  CANCELLED_OWNER:  "Cancelado por el dueño",
  CANCELLED_WALKER: "Cancelado por el paseador",
};

type BadgeVariant = "success" | "warning" | "error" | "info" | "default";

/**
 * Color del estado, centralizado acá junto con la etiqueta.
 *
 * Antes cada pantalla pintaba el estado con el mismo terracota, sin importar
 * cuál fuera: un paseo cancelado se veía igual que uno completado. El color
 * es información, no decoración — que la lea de un vistazo evita que alguien
 * crea que un paseo sigue en pie cuando ya se cayó.
 */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING:          "warning",
  CONFIRMED:        "info",
  WALKER_ON_WAY:    "info",
  IN_PROGRESS:      "info",
  COMPLETED:        "success",
  CANCELLED_OWNER:  "error",
  CANCELLED_WALKER: "error",
};

/**
 * /dashboard — Redirige según el rol del usuario.
 * Owner  → ve sus perros y paseos contratados
 * Walker → ve los trabajos disponibles y sus paseos activos
 * Admin  → ve el panel de administración
 *
 * TODO: implementar redirección client-side basada en useStore().user.role
 */
export default function DashboardPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
    </div>
  );
}

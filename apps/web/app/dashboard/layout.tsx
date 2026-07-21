import { AppHeader } from "@/components/AppHeader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-bg flex flex-col">
      <AppHeader />
      {children}
    </div>
  );
}

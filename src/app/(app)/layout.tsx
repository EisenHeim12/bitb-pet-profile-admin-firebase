import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen grid grid-cols-[260px_1fr]">
        <Sidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </AuthGate>
  );
}

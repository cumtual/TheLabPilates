export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-container-low py-8">
      {children}
    </main>
  );
}

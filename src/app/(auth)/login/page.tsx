import { LoginForm } from '@/components/auth/LoginForm';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirect } = await searchParams;
  return <LoginForm redirectTo={safeRedirectPath(redirect) ?? undefined} />;
}

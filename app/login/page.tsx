import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { LoginForm } from "@/components/auth/login-form";
import { LoginFormWithNext } from "@/components/auth/login-form-with-next";
import { PasskeySignInButton } from "@/components/auth/passkey-panel";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-5xl place-items-center px-6 py-12 md:py-16">
        <Card className="grid w-full gap-8 rounded-lg p-6 md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="flex flex-col justify-between border-b border-[var(--border)] pb-8 md:border-b-0 md:border-r md:pb-0 md:pr-10">
            <div>
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-2xl font-bold text-[var(--ink)]">Portal Authentication</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Access your secure Exam Vault workspace. Owners enter their administrative credentials; students enter their personalized login code and password.
                </CardDescription>
              </CardHeader>
              <Suspense fallback={<LoginForm />}>
                <LoginFormWithNext />
              </Suspense>
            </div>
          </section>
          <section className="flex flex-col justify-between md:pl-6">
            <div>
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-xl font-bold text-[var(--ink)]">Student Activation</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  First-time students activate using a secure login code and one-time activation code to initialize credentials.
                </CardDescription>
              </CardHeader>
              <div className="grid gap-5 text-sm leading-6 text-[var(--muted)]">
                <p>
                  Once successfully activated, return to this portal and use the login form with your personalized code (e.g., <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--primary)]">STU-XXXX</code>) and password.
                </p>
                <ButtonLink href="/activate" variant="secondary" className="w-full justify-center">
                  Activate Account
                </ButtonLink>
              </div>
            </div>
            <div className="mt-8 border-t border-[var(--border)] pt-6">
              <PasskeySignInButton />
            </div>
          </section>
        </Card>
      </main>
    </>
  );
}

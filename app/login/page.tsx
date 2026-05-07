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
      <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-5xl place-items-center px-5 py-10">
        <Card className="paper-sheet grid w-full gap-8 p-6 md:grid-cols-[1fr_1fr] md:p-8">
          <section className="border-b border-[var(--border)] pb-6 md:border-b-0 md:border-r md:pb-0 md:pr-8">
            <CardHeader>
              <CardTitle>Owner and student login</CardTitle>
              <CardDescription>
                Owners enter their email and password. Students enter their owner-issued login code and password in this
                same form.
              </CardDescription>
            </CardHeader>
            <Suspense fallback={<LoginForm />}>
              <LoginFormWithNext />
            </Suspense>
          </section>
          <section className="md:pl-2">
            <CardHeader>
              <CardTitle>Student access</CardTitle>
              <CardDescription>
                Students activate with a login code and one-time activation code before setting a password.
              </CardDescription>
            </CardHeader>
            <div className="grid gap-4 text-sm leading-6 text-[var(--muted)]">
              <p>
                After activation, return to this page and use the login form with your login code, for example
                STU-XXXX, plus the password you set. No student email address is needed.
              </p>
              <ButtonLink href="/activate" variant="secondary">
                Activate student account
              </ButtonLink>
              <PasskeySignInButton />
            </div>
          </section>
        </Card>
      </main>
    </>
  );
}

import { AppHeader } from "@/components/app-header";
import { LoginForm } from "@/components/auth/login-form";
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
              <CardTitle>Owner login</CardTitle>
              <CardDescription>
                Owners use a real email and password. Enforce MFA/AAL2 before production publish and assignment.
              </CardDescription>
            </CardHeader>
            <LoginForm />
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
                After activation, students sign in with the internal alias generated from their login code.
                No real student email delivery is required in this MVP.
              </p>
              <ButtonLink href="/activate" variant="secondary">
                Activate student account
              </ButtonLink>
            </div>
          </section>
        </Card>
      </main>
    </>
  );
}

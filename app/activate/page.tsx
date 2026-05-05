import { AppHeader } from "@/components/app-header";
import { ActivationForm } from "@/components/auth/activation-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActivatePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[520px] place-items-center px-5 py-10">
        <Card className="paper-sheet w-full p-6 md:p-8">
          <CardHeader>
            <CardTitle>Activate student account</CardTitle>
            <CardDescription>
              Use the login code and one-time activation code issued by the owner. No student email delivery is
              required for the MVP.
            </CardDescription>
          </CardHeader>
          <ActivationForm />
        </Card>
      </main>
    </>
  );
}

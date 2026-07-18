import type { Metadata } from "next";
import { signIn, devLoginEnabled } from "@/auth";
import { googleEnabled, ALLOWED_EMAIL_DOMAIN } from "@/auth.config";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="text-2xl font-bold text-ink">Weekly Goal Tracker</h1>
          <p className="mt-2 text-sm text-muted-fg">
            Set up to 5 goals each week and check off the subtasks that get you
            there.
          </p>
        </div>

        {error === "AccessDenied" && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Use your <span className="font-semibold">@{ALLOWED_EMAIL_DOMAIN}</span>{" "}
            account to sign in.
          </div>
        )}

        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-brand/40 hover:bg-canvas"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>
        )}

        {devLoginEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/dashboard" });
            }}
            className="mt-3"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-4 py-3 text-sm font-medium text-muted-fg transition-colors hover:bg-line"
            >
              Test
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

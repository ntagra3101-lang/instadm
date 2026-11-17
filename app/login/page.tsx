import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";
import { DemoNotice } from "@/components/demo-notice";
import { isPublicDemoHost } from "@/lib/env";

const GITHUB_URL = "https://github.com/diwenne/openreply";
const SETUP_DOCS_URL = `${GITHUB_URL}/blob/main/docs/setup.md`;

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Login - Insta DM"),
    description: t("Sign in to manage Instagram comment-to-DM campaigns."),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    reset?: string;
    callbackUrl?: string;
    template?: string;
  }>;
}) {
  const { t } = await getI18n();
  if (await isPublicDemoHost()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Insta DM
          </h1>
          <div className="panel rounded p-8 mt-8 shadow-black/40">
            <h2 className="text-lg font-semibold text-foreground">
              {t("Sign-in is off on this demo")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t("This is the public demo — it doesn’t create real accounts or send DMs. To use Insta DM for real, clone it and run your own instance with your own Meta app and domain.")}
            </p>
            <a
              href={SETUP_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-indigo-500/25 transition-all hover:shadow-indigo-500/30"
            >
              {t("Clone it yourself")} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const selectedTemplate = getCampaignTemplate(params.template);
  const templateCallbackUrl = selectedTemplate
    ? `/campaigns/new?template=${selectedTemplate.slug}`
    : null;
  const rawCallback = params.callbackUrl ?? templateCallbackUrl ?? "/dashboard";
  // Only same-site paths, never another domain.
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/dashboard";

  async function signInWithPassword(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: String(formData.get("username") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/login?error=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
      }
      throw error;
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Insta DM</h1>
          <p className="text-muted text-sm leading-relaxed mt-2">Sign in to your dashboard.</p>
        </div>

        <DemoNotice variant="panel" />

        <div className="panel rounded p-8 shadow-black/40">
          {params.error && (
            <p className="mb-5 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
              Wrong username or password. After 10 wrong tries, wait 15 minutes.
            </p>
          )}
          {params.reset === "1" && (
            <p className="mb-5 rounded border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-800">
              Password updated. Sign in with your new password.
            </p>
          )}
          <form action={signInWithPassword} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-foreground">
                Username
              </label>
              <input id="username" name="username" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-indigo-500/25 transition-all hover:shadow-indigo-500/30"
            >
              Sign in
            </button>
          </form>
          <p className="mt-5 text-center text-sm">
            <Link href="/forgot-password" className="text-accent hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

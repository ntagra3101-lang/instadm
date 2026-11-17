import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import {
  MIN_PASSWORD_LENGTH,
  RESET_IDENTIFIER_PREFIX,
  clearAttempts,
  getOwnerEmail,
  hashPassword,
  hashResetToken,
} from "@/lib/password-auth";

export const metadata = { title: "Reset password - Insta DM" };

async function findValidToken(token: string) {
  const owner = getOwnerEmail();
  if (!owner || !token) return null;
  const row = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: { identifier: `${RESET_IDENTIFIER_PREFIX}${owner}`, token: hashResetToken(token) },
    },
  });
  if (!row || row.expires.getTime() < Date.now()) return null;
  return { owner, row };
}

async function setNewPassword(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const q = `token=${encodeURIComponent(token)}`;
  if (password.length < MIN_PASSWORD_LENGTH) redirect(`/reset-password?${q}&error=short`);
  if (password !== confirm) redirect(`/reset-password?${q}&error=match`);

  const valid = await findValidToken(token);
  if (!valid) redirect("/reset-password?error=expired");

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: valid.owner },
    update: { passwordHash },
    create: { email: valid.owner, emailVerified: new Date(), passwordHash },
  });
  // Single use: remove every outstanding reset link.
  await prisma.verificationToken.deleteMany({ where: { identifier: valid.row.identifier } });
  await clearAttempts("login:all");
  redirect("/login?reset=1");
}

const ERRORS: Record<string, string> = {
  short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  match: "The two passwords don't match.",
  expired: "This link has expired or was already used. Ask for a new one.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const valid = await findValidToken(token);
  const inputClass =
    "w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground focus:border-accent/40 focus:outline-none";
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Insta DM</h1>
          <p className="text-muted text-sm leading-relaxed mt-2">Set a new password</p>
        </div>
        <div className="panel rounded p-8 shadow-black/40">
          {error && ERRORS[error] && (
            <p className="mb-5 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{ERRORS[error]}</p>
          )}
          {valid ? (
            <form action={setNewPassword} className="space-y-5">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">New password</label>
                <input id="password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground">Type it again</label>
                <input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} />
              </div>
              <button type="submit" className="w-full inline-flex items-center justify-center rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white">
                Save new password
              </button>
            </form>
          ) : (
            <p className="text-sm text-foreground text-center">{ERRORS.expired}</p>
          )}
          <p className="mt-5 text-center text-sm">
            <Link href="/forgot-password" className="text-accent hover:underline">Send a new link</Link>
            {" · "}
            <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

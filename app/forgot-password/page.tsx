import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import {
  RESET_IDENTIFIER_PREFIX,
  RESET_TTL_MS,
  clientIp,
  getOwnerEmail,
  hashResetToken,
  maskEmail,
  takeAttempt,
} from "@/lib/password-auth";

export const metadata = { title: "Forgot password - Insta DM" };

// The reset link always goes to the owner's address (first of ALLOWED_EMAILS).
// Nobody can type in another address, so a stranger can't redirect it.
async function sendResetLink() {
  "use server";
  const owner = getOwnerEmail();
  const ip = clientIp(await headers());
  const ipOk = await takeAttempt(`reset:ip:${ip}`, 5, 60 * 60);
  const allOk = await takeAttempt("reset:all", 10, 60 * 60);
  if (!owner || !ipOk || !allOk || !process.env.RESEND_API_KEY) {
    redirect("/forgot-password?sent=1");
  }

  const token = randomBytes(32).toString("base64url");
  const identifier = `${RESET_IDENTIFIER_PREFIX}${owner}`;
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: hashResetToken(token), expires: new Date(Date.now() + RESET_TTL_MS) },
  });

  const link = `${getBaseUrl()}/reset-password?token=${token}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Insta DM <onboarding@resend.dev>",
      to: [owner],
      subject: "Reset your Insta DM password",
      text: `Someone asked to reset your Insta DM password.\n\nSet a new password here (works once, for 30 minutes):\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.`,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => undefined);

  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const owner = getOwnerEmail();
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Insta DM</h1>
          <p className="text-muted text-sm leading-relaxed mt-2">Forgot password</p>
        </div>
        <div className="panel rounded p-8 shadow-black/40 text-center">
          {sent === "1" ? (
            <p className="text-sm text-foreground">
              If everything is set up, a reset link is on its way to {owner ? maskEmail(owner) : "the owner's email"}. It works once, for 30 minutes. Check spam too.
            </p>
          ) : (
            <form action={sendResetLink} className="space-y-5">
              <p className="text-sm text-muted">
                We&apos;ll email a reset link to {owner ? maskEmail(owner) : "the owner's email"}. Only that address can reset the password.
              </p>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white"
              >
                Email me a reset link
              </button>
            </form>
          )}
          <p className="mt-5 text-sm">
            <Link href="/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

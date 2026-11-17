import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser, getPrimaryWorkspace } from "@/lib/workspace";
import { isEmailAllowedToSignIn } from "@/lib/env";
import {
  clearAttempts,
  clientIp,
  getLoginUsername,
  getOwnerEmail,
  takeAttempt,
  verifyPassword,
} from "@/lib/password-auth";

type AdapterPrismaClient = Parameters<typeof PrismaAdapter>[0];

// Username/password login for the single owner (insta-autodm). Magic-link
// email sign-in is removed; "forgot password" emails the owner a reset link.
export const authConfig = {
  adapter: PrismaAdapter(prisma as unknown as AdapterPrismaClient),
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username = String(credentials?.username ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const expectedUsername = getLoginUsername();
        const ownerEmail = getOwnerEmail();
        if (!expectedUsername || !ownerEmail || !password) return null;

        const ip = clientIp(request?.headers);
        const ipOk = await takeAttempt(`login:ip:${ip}`, 10, 15 * 60);
        const allOk = await takeAttempt("login:all", 100, 60 * 60);
        if (!ipOk || !allOk) return null;

        let user = await prisma.user.findUnique({ where: { email: ownerEmail } });
        const storedHash = user?.passwordHash ?? process.env.LOGIN_PASSWORD_HASH;
        // Always run the hash check so a wrong username takes as long as a wrong password.
        const passwordOk = await verifyPassword(password, storedHash);
        if (!passwordOk || username !== expectedUsername) return null;

        await clearAttempts(`login:ip:${ip}`);
        if (!user) {
          user = await prisma.user.create({
            data: { email: ownerEmail, emailVerified: new Date() },
          });
          await ensureWorkspaceForUser(user.id, user.email);
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowedToSignIn(user?.email);
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensureWorkspaceForUser(user.id, user.email);
      }
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    // Credentials sign-in requires JWT sessions in Auth.js.
    strategy: "jwt",
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const workspace = await getPrimaryWorkspace(userId);
  if (workspace) return workspace.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const createdWorkspace = await ensureWorkspaceForUser(userId, user?.email);
  return createdWorkspace.id;
}

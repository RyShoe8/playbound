import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { isFounderAdminEmail } from "@/lib/admin";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { resolveOAuthUser } from "@/lib/oauthUser";
import { recaptchaErrorMessage, verifyRecaptcha } from "@/lib/recaptcha";
import { SITE_URL } from "@/lib/site";

if (process.env.NEXTAUTH_URL && !/^https?:\/\/[a-zA-Z0-9.-]+/i.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = "http://localhost:3000";
}

const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const authOptions: NextAuthOptions = {
  providers: [
    // Registered conditionally so the app still boots (with password login
    // only) when the Google credentials are absent — local dev, previews, CI.
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: "select_account",
                access_type: "online",
                // Identity only. Requesting nothing further keeps the consent
                // screen on the non-sensitive track, which avoids Google's
                // verification review entirely.
                scope: "openid email profile",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        recaptchaToken: { label: "reCAPTCHA", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        try {
          // Rate-limits credential stuffing. Checked before the database lookup
          // and the bcrypt compare, so a scripted attack cannot use this endpoint
          // to burn CPU either.
          const captcha = await verifyRecaptcha(credentials.recaptchaToken, "login");
          if (!captcha.ok) {
            console.warn(`[login] reCAPTCHA rejected: ${captcha.reason}`);
            throw new Error(recaptchaErrorMessage(captcha.reason));
          }

          await dbConnect();

          const user = await User.findOne({ email: credentials.email.toLowerCase() }).select("+password");

          if (!user) {
            throw new Error("Invalid email or password");
          }

          // Account exists but was created through Google, so there is nothing to
          // compare against. Point them at the right button instead of the
          // generic failure, which would otherwise be a dead end.
          if (!user.password) {
            const providers: string[] = user.authProviders ?? [];
            throw new Error(
              providers.includes("google")
                ? "This account uses Google sign-in. Use the Sign in with Google button above."
                : "Invalid email or password"
            );
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
          if (!isPasswordValid) {
            throw new Error("Invalid email or password");
          }

          if (user.disabled) {
            throw new Error("This account has been disabled. Contact support if you think this is a mistake.");
          }

          if (!user.emailVerified) {
            throw new Error("Please verify your email before signing in. Check your inbox for the verification link.");
          }

          if (isFounderAdminEmail(user.email) && user.role !== "admin") {
            user.role = "admin";
            await user.save();
          }

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.username,
            role: user.role,
            tester: Boolean(user.tester),
          };
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          const knownUserErrors = [
            "Missing email or password",
            "Invalid email or password",
            "This account uses Google sign-in",
            "This account has been disabled",
            "Please verify your email",
            "That took a little too long",
            "Couldn't complete the bot check",
            "Bot protection is temporarily unavailable",
            "We couldn't verify this request",
          ];
          if (knownUserErrors.some((prefix) => raw.includes(prefix))) {
            throw err;
          }
          console.error("[login] unexpected error in authorize:", err);
          throw new Error("A connection error occurred while signing in. Please try again shortly.");
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    /**
     * Resolve post-auth redirects against a stable origin.
     *
     * NextAuth's default resolves everything against NEXTAUTH_URL. On Vercel
     * that can be a per-deployment host, so once the deployment was superseded
     * sign-out sent people somewhere that no longer existed and Vercel
     * answered DEPLOYMENT_NOT_FOUND.
     *
     * The return value MUST be an absolute URL. `signIn(..., { redirect:
     * false })` — which the login form uses — passes it to `new URL()` on the
     * client, and a relative path throws "Failed to construct 'URL'", leaving
     * the form hanging even though the session cookie was set. So the fix is
     * to correct the *origin*, not to drop it.
     */
    async redirect({ url, baseUrl }) {
      /**
       * Prefer the canonical site over a throwaway deployment host. Anything
       * else — a real custom domain, or localhost in development — is already
       * the host the user is on, so it is left alone.
       */
      const safeOrigin = (() => {
        try {
          return /\.vercel\.app$/i.test(new URL(baseUrl).hostname) ? SITE_URL : baseUrl;
        } catch {
          return SITE_URL;
        }
      })();

      // A protocol-relative URL ("//evil.com") also starts with "/", and
      // backslashes are normalised to "//" by some browsers — both would be
      // open redirects if resolved naively, so they fall through to the root.
      if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
        return `${safeOrigin}${url}`;
      }

      // Absolute URLs are honoured only for our own origins, so a crafted
      // callbackUrl cannot bounce a freshly signed-in user off-site.
      try {
        const target = new URL(url);
        if (target.origin === baseUrl || target.origin === SITE_URL) {
          return `${safeOrigin}${target.pathname}${target.search}${target.hash}`;
        }
      } catch {
        /* not a parseable URL — fall through */
      }
      return safeOrigin;
    },

    /**
     * OAuth sign-ins are resolved to a Mongo user here.
     *
     * There is no database adapter — the session strategy is JWT and the rest
     * of the app keys off a Mongo ObjectId — so the upsert and account linking
     * have to happen explicitly. Returning a string redirects to /login with
     * that code in ?error=, which the login page renders as a message.
     */
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;

      const email = user.email ?? profile?.email ?? "";
      // Google sets email_verified on the profile; treat anything else as
      // unverified rather than assuming.
      const emailVerified =
        typeof (profile as { email_verified?: boolean } | undefined)?.email_verified === "boolean"
          ? Boolean((profile as { email_verified?: boolean }).email_verified)
          : false;

      const resolved = await resolveOAuthUser({
        provider: account.provider,
        email,
        emailVerified,
        name: user.name,
        image: user.image,
      });

      if (!resolved.ok) return `/login?error=${resolved.reason}`;

      // Hand the resolved identity to the jwt callback via the user object.
      user.id = resolved.userId;
      user.role = resolved.role;
      user.tester = resolved.tester;
      user.name = resolved.username;
      user.needsUsername = resolved.needsUsername;
      return true;
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.name ?? undefined;
        token.role = user.role;
        token.tester = Boolean(user.tester);
        token.needsUsername = Boolean(user.needsUsername);
        token.roleCheckedAt = Date.now();
      } else if (token.id) {
        // Re-read role/tester from Mongo so promotions appear without re-login.
        const last = typeof token.roleCheckedAt === "number" ? token.roleCheckedAt : 0;
        if (Date.now() - last > 60_000) {
          await dbConnect();
          const dbUser = await User.findById(token.id).select("role tester disabled").lean();
          if (!dbUser || dbUser.disabled) {
            return {};
          }
          token.role = dbUser.role;
          token.tester = Boolean(dbUser.tester);
          token.roleCheckedAt = Date.now();
        }
      }
      if (trigger === "update" && session?.username) {
        token.username = session.username as string;
        // Choosing a username on /welcome is what clears the gate.
        token.needsUsername = false;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as "user" | "admin";
        session.user.tester = Boolean(token.tester);
        session.user.needsUsername = Boolean(token.needsUsername);
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { isFounderAdminEmail } from "@/lib/admin";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

if (process.env.NEXTAUTH_URL && !/^https?:\/\/[a-zA-Z0-9.-]+/i.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = "http://localhost:3000";
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        await dbConnect();

        const user = await User.findOne({ email: credentials.email.toLowerCase() }).select("+password");

        if (!user || !user.password) {
          throw new Error("Invalid email or password");
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
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.name ?? undefined;
        token.role = user.role;
      }
      if (trigger === "update" && session?.username) {
        token.username = session.username as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as "user" | "admin";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

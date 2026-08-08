import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: "user" | "admin";
      tester?: boolean;
      /** True until an OAuth signup picks a PlayBound username on /welcome. */
      needsUsername?: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    role: "user" | "admin";
    tester?: boolean;
    needsUsername?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "user" | "admin";
    tester?: boolean;
    needsUsername?: boolean;
    roleCheckedAt?: number;
  }
}

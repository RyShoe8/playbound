export type AdminAccessRole = "user" | "developer" | "admin_viewer" | "admin";

export function canViewAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "admin_viewer";
}

export function canWriteAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

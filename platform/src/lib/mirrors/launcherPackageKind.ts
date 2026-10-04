/** File types accepted by the admin upload flow and understood by the launcher. */
export function launcherPackageKind(fileName: string): "direct-zip" | "direct-7z" | "direct-installer" | null {
  if (/\.zip$/i.test(fileName)) return "direct-zip";
  if (/\.7z$/i.test(fileName)) return "direct-7z";
  if (/\.(exe|msi)$/i.test(fileName)) return "direct-installer";
  return null;
}

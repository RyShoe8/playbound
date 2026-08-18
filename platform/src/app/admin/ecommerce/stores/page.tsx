import type { Metadata } from "next";
import { EcommerceStoresManager } from "@/components/admin/EcommerceStoresManager";

export const metadata: Metadata = { title: "Stores | Admin" };

export default function AdminEcommerceStoresPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stores</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Enable matching, paste product feeds, or leave a store manual.
        </p>
      </div>
      <EcommerceStoresManager />
    </div>
  );
}

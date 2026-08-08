import { HardwareCatalogAdmin } from "@/components/admin/HardwareCatalogAdmin";

export const metadata = { title: "Hardware — Admin" };

export default function AdminHardwarePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Hardware catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Curate CPU/GPU performance tiers used by the compatibility engine.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">CPUs</h2>
        <HardwareCatalogAdmin kind="cpus" />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">GPUs</h2>
        <HardwareCatalogAdmin kind="gpus" />
      </section>
    </div>
  );
}

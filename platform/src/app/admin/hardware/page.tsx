import { HardwareCatalogAdmin } from "@/components/admin/HardwareCatalogAdmin";
import { RAM_AMOUNT_PRESETS_GB } from "@/lib/hardware/types";

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
      <section className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
        <h2 className="text-lg font-bold">RAM amounts</h2>
        <p className="text-sm text-muted-foreground">
          RAM is compared as a number of megabytes on the player profile versus each game’s min
          and recommended RAM. There is no stick/SKU catalog. Use these standard buckets in the
          game editor:
        </p>
        <div className="flex flex-wrap gap-2">
          {RAM_AMOUNT_PRESETS_GB.map((gb) => (
            <span
              key={gb}
              className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium"
            >
              {gb} GB
              <span className="ml-1 text-xs text-muted-foreground">({gb * 1024} MB)</span>
            </span>
          ))}
        </div>
      </section>
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

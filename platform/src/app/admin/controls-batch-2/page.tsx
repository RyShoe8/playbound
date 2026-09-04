import { ControlsBatchButton } from "./ControlsBatchButton";

export default function ControlsBatchTwoPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Controls batch 2</h1>
      <p className="text-muted-foreground">
        Adds schema-validated controls to 25 hardcoded games. The operation has no upsert and only uses $set on the controls field.
      </p>
      <ControlsBatchButton />
    </main>
  );
}

import dbConnect from "@/lib/db";
import ConnectSettings from "@/lib/models/ConnectSettings";

export type ConnectSettingsView = {
  streamingMetricsEnabled: boolean;
};

export async function getConnectSettings(): Promise<ConnectSettingsView> {
  await dbConnect();
  const doc = await ConnectSettings.findOneAndUpdate(
    { singletonKey: "default" },
    { $setOnInsert: { singletonKey: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return {
    streamingMetricsEnabled: Boolean(doc?.streamingMetricsEnabled),
  };
}

export async function setStreamingMetricsEnabled(
  enabled: boolean
): Promise<ConnectSettingsView> {
  await dbConnect();
  const doc = await ConnectSettings.findOneAndUpdate(
    { singletonKey: "default" },
    {
      $set: { streamingMetricsEnabled: enabled },
      $setOnInsert: { singletonKey: "default" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return {
    streamingMetricsEnabled: Boolean(doc?.streamingMetricsEnabled),
  };
}

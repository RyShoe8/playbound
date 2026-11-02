import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { MongoClient } from "mongodb";
import { attachDbDiagnostics, describeCommand } from "@/lib/dbDiagnostics";

it("distinguishes connection establishment from pool usage without logging addresses", () => {
  const client = new EventEmitter();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    attachDbDiagnostics(client as unknown as MongoClient, 20);
    attachDbDiagnostics(client as unknown as MongoClient, 20);
    const connection = { address: "private-db-host", connectionId: 1 };
    client.emit("connectionCreated", connection);
    client.emit("connectionCheckOutFailed", { reason: "timeout", durationMS: 10000 });
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("observedReady 0, connecting 1"));
    client.emit("connectionReady", connection);
    client.emit("connectionCheckedOut", { durationMS: 0 });
    client.emit("connectionCheckOutFailed", { reason: "timeout", durationMS: 10000 });
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("inUse 1/20, observedReady 1, connecting 0"));
    client.emit("connectionCheckedIn");
    client.emit("connectionClosed", connection);
    client.emit("connectionCheckOutFailed", { reason: "timeout", durationMS: 10000 });
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("inUse 0/20, observedReady 0, connecting 0"));
    expect(warn).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-db-host");
  } finally {
    warn.mockRestore();
  }
});

describe("describeCommand", () => {
  it("names the collection and the filter fields, never their values", () => {
    const d = describeCommand("find", { find: "cataloggames", filter: { slug: "secret-value", status: "published" } });
    expect(d).toEqual({ label: "cataloggames.find", filterKeys: "slug,status" });
    expect(JSON.stringify(d)).not.toContain("secret-value");
  });

  it("reads update, delete and aggregate filters", () => {
    expect(describeCommand("update", { update: "parties", updates: [{ q: { _id: 1 } }] })?.filterKeys).toBe("_id");
    expect(describeCommand("delete", { delete: "presence", deletes: [{ q: { userId: 1 } }] })?.filterKeys).toBe("userId");
    expect(describeCommand("aggregate", { aggregate: "events", pipeline: [{ $match: { kind: 1 } }, { $group: {} }] })?.filterKeys).toBe("kind");
  });

  it("skips handshake and cursor bookkeeping commands", () => {
    expect(describeCommand("hello", { hello: 1 })).toBeNull();
    expect(describeCommand("getMore", { getMore: 1, collection: "x" })).toBeNull();
  });
});

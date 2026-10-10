import { describe, expect, it } from "vitest";
import { formatEventName } from "./eventLabels";

describe("formatEventName", () => {
  it("title-cases snake_case identifiers", () => {
    expect(formatEventName("launcher_install")).toBe("Launcher Install");
    expect(formatEventName("edition_launched")).toBe("Edition Launched");
    expect(formatEventName("party_member_dropped_offline")).toBe("Party Member Dropped Offline");
  });

  it("keeps known acronyms upper-case", () => {
    expect(formatEventName("exe_located")).toBe("EXE Located");
    expect(formatEventName("party_lan_ready")).toBe("Party LAN Ready");
    expect(formatEventName("java_runtime_install_failed")).toBe("Java Runtime Install Failed");
  });

  it("is safe on empty and odd input", () => {
    expect(formatEventName("")).toBe("Unknown");
    expect(formatEventName(null)).toBe("Unknown");
    expect(formatEventName("error")).toBe("Error");
    expect(formatEventName("page_view")).toBe("Page View");
  });
});

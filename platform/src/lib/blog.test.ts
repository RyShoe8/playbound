import { describe, expect, it, vi } from "vitest";

const { find, findOne } = vi.hoisted(() => ({ find: vi.fn(), findOne: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/models/BlogPost", () => ({ default: { find, findOne } }));

import { getPublishedBlogPost, listPublishedBlogPosts } from "./blog";

describe("public blog reads", () => {
  it("never lists drafts", async () => {
    find.mockReturnValue({ select: () => ({ sort: () => ({ lean: async () => [] }) }) });
    await listPublishedBlogPosts();
    expect(find).toHaveBeenCalledWith({ published: true });
  });

  it("never resolves a draft by its direct URL", async () => {
    findOne.mockReturnValue({ lean: async () => null });
    expect(await getPublishedBlogPost("private-draft")).toBeNull();
    expect(findOne).toHaveBeenCalledWith({ slug: "private-draft", published: true });
  });
});

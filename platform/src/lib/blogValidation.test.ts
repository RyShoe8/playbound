import { describe, expect, it } from "vitest";
import { blogPostInput, createBlogPostInput } from "./blogValidation";

const valid = {
  slug: "a-new-way-to-play",
  title: "A new way to play",
  summary: "A practical look at what is changing for PlayBound players.",
  bodyMarkdown: "## What changed\n\nWe tested the new flow across several games before publishing it.",
  coverImageUrl: "",
  authorName: "PlayBound Team",
  published: false,
};

describe("blog post validation", () => {
  it("accepts a draft and a publish transition", () => {
    expect(createBlogPostInput.parse(valid).published).toBe(false);
    expect(blogPostInput.parse({ ...valid, published: true }).published).toBe(true);
  });

  it("rejects unsafe slugs and non-HTTPS cover URLs", () => {
    expect(createBlogPostInput.safeParse({ ...valid, slug: "../admin" }).success).toBe(false);
    expect(createBlogPostInput.safeParse({ ...valid, coverImageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(createBlogPostInput.safeParse({ ...valid, coverImageUrl: "http://example.com/cover.jpg" }).success).toBe(false);
  });
});

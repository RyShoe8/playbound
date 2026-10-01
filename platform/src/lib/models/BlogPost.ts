import { Schema, model, models } from "mongoose";

const BlogPostSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    title: { type: String, required: true, maxlength: 160 },
    summary: { type: String, required: true, maxlength: 400 },
    bodyMarkdown: { type: String, required: true, maxlength: 100000 },
    coverImageUrl: { type: String, default: null, maxlength: 2048 },
    authorName: { type: String, required: true, default: "PlayBound Team", maxlength: 100 },
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BlogPostSchema.index({ published: 1, publishedAt: -1 });

const BlogPost = models.BlogPost || model("BlogPost", BlogPostSchema);
export default BlogPost;

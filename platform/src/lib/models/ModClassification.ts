import { Schema, model, models, type Document, type Types } from "mongoose";

export interface IModClassification extends Document {
  name: string;
  slug: string;
  description?: string | null;
  parentId?: Types.ObjectId | null;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ModClassificationSchema = new Schema<IModClassification>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String, default: null, trim: true },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "ModClassification",
      default: null,
      index: true,
    },
    icon: { type: String, default: null, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

ModClassificationSchema.index({ parentId: 1, sortOrder: 1, name: 1 });

const ModClassification =
  models.ModClassification || model<IModClassification>("ModClassification", ModClassificationSchema);

export default ModClassification;

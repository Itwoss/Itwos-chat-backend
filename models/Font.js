import mongoose from 'mongoose';

const fontSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Font name is required'],
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters'],
    },
    fontFamily: {
      type: String,
      required: [true, 'fontFamily is required for CSS'],
      trim: true,
      maxlength: [200, 'fontFamily cannot exceed 200 characters'],
    },
    fileUrl: { type: String, trim: true, default: '' },
    previewUrl: { type: String, trim: true, default: '' },
    googleFontsCssUrl: { type: String, trim: true, default: '' },
    googleFont: { type: Boolean, default: false },
    fontSource: { type: String, trim: true, default: '' },
    price: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Price cannot be negative'],
    },
    category: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    fontType: {
      type: String,
      trim: true,
      default: 'modern_sans',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [600, 'Description cannot exceed 600 characters'],
      default: '',
    },
    cssStyles: {
      type: String,
      default: '',
    },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    purchaseCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

fontSchema.index({ isActive: 1, category: 1 });
fontSchema.index({ fontType: 1 });

const Font = mongoose.model('Font', fontSchema);
export default Font;

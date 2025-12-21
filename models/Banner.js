import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Banner name is required'],
    trim: true,
    maxlength: [100, 'Banner name cannot exceed 100 characters']
  },
  imageUrl: {
    type: String,
    required: [true, 'Banner image URL is required'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Banner price is required'],
    min: [0, 'Price cannot be negative']
  },
  rarity: {
    type: String,
    required: [true, 'Banner rarity is required'],
    enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'],
    default: 'Common'
  },
  effect: {
    type: String,
    required: [true, 'Banner effect is required'],
    enum: ['none', 'glow', 'fire', 'neon', 'ice', 'thunder', 'sparkle', 'animated'],
    default: 'none'
  },
  category: {
    type: String,
    required: [true, 'Banner category is required'],
    trim: true
  },
  stock: {
    type: Number,
    default: -1, // -1 means unlimited
    min: [-1, 'Stock cannot be less than -1']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  purchaseCount: {
    type: Number,
    default: 0,
    min: [0, 'Purchase count cannot be negative']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for better query performance
bannerSchema.index({ isActive: 1, rarity: 1 });
bannerSchema.index({ category: 1 });
bannerSchema.index({ price: 1 });
bannerSchema.index({ rarity: 1, effect: 1 });

const Banner = mongoose.model('Banner', bannerSchema);

export default Banner;




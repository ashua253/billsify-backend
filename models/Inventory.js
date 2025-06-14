// models/Inventory.js - Inventory management model
const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  affiliateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  itemName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  itemDescription: {
    type: String,
    trim: true,
    default: ''
  },
  
  category: {
    type: String,
    trim: true,
    default: 'General'
  },
  
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  
  availableQuantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  
  minimumStockLevel: {
    type: Number,
    min: 0,
    default: 5
  },
  
  unit: {
    type: String,
    default: 'pcs', // pieces, kg, liters, etc.
    trim: true
  },
  
  sku: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Tracking fields
  totalSold: {
    type: Number,
    default: 0,
    min: 0
  },
  
  lastSoldAt: Date,
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
inventorySchema.index({ affiliateId: 1, itemName: 1 });
inventorySchema.index({ affiliateId: 1, isActive: 1 });
inventorySchema.index({ itemName: 'text', itemDescription: 'text' });

// Instance methods
inventorySchema.methods.updateStock = function(quantitySold) {
  this.availableQuantity = Math.max(0, this.availableQuantity - quantitySold);
  this.totalSold += quantitySold;
  this.lastSoldAt = new Date();
  return this.save();
};

inventorySchema.methods.addStock = function(quantity) {
  this.availableQuantity += quantity;
  return this.save();
};

inventorySchema.methods.isLowStock = function() {
  return this.availableQuantity <= this.minimumStockLevel;
};

// Static methods
inventorySchema.statics.searchItems = function(affiliateId, searchQuery) {
  return this.find({
    affiliateId: affiliateId,
    isActive: true,
    $or: [
      { itemName: { $regex: searchQuery, $options: 'i' } },
      { itemDescription: { $regex: searchQuery, $options: 'i' } }
    ]
  }).limit(10);
};

inventorySchema.statics.getLowStockItems = function(affiliateId) {
  return this.aggregate([
    { $match: { affiliateId: affiliateId, isActive: true } },
    { $addFields: { isLowStock: { $lte: ['$availableQuantity', '$minimumStockLevel'] } } },
    { $match: { isLowStock: true } },
    { $sort: { availableQuantity: 1 } }
  ]);
};

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;
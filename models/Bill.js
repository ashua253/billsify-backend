// models/Bill.js - Fixed to match frontend structure
const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Frontend-compatible fields (primary)
  deviceName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  deviceNumber: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  deviceCost: {
    type: Number,
    required: true,
    min: 0
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  imageUri: {
    type: String,
    default: null
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  
  // Backend-compatible fields (for compatibility)
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  vendor: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  
  category: {
    type: String,
    default: 'Other',
    enum: [
      'General', 
      'Electronics', 
      'Utilities', 
      'Food', 
      'Transportation', 
      'Healthcare', 
      'Entertainment', 
      'Shopping', 
      'Services',
      'Other'  // Changed from 'other' to 'Other'
    ]
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Store frontend-specific data for compatibility
  frontendData: {
    deviceName: String,
    deviceNumber: String,
    deviceCost: String,
    remarks: String,
    imageUri: String,
    submittedAt: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
billSchema.index({ userId: 1, createdAt: -1 });
billSchema.index({ userId: 1, category: 1 });
billSchema.index({ userId: 1, date: -1 });

// Text index for search functionality
billSchema.index({
  deviceName: 'text',
  deviceNumber: 'text',
  remarks: 'text',
  description: 'text',
  vendor: 'text',
  notes: 'text'
});

// Pre-save middleware to ensure field consistency
billSchema.pre('save', function(next) {
  // Sync deviceCost with amount
  if (!this.amount && this.deviceCost) {
    this.amount = this.deviceCost;
  }
  if (!this.deviceCost && this.amount) {
    this.deviceCost = this.amount;
  }
  
  // Sync deviceName with description
  if (!this.description && this.deviceName) {
    this.description = this.deviceName;
  }
  if (!this.deviceName && this.description) {
    this.deviceName = this.description;
  }
  
  // Sync deviceNumber with vendor
  if (!this.vendor && this.deviceNumber) {
    this.vendor = this.deviceNumber;
  }
  if (!this.deviceNumber && this.vendor) {
    this.deviceNumber = this.vendor;
  }
  
  // Sync remarks with notes
  if (!this.notes && this.remarks) {
    this.notes = this.remarks;
  }
  if (!this.remarks && this.notes) {
    this.remarks = this.notes;
  }
  
  next();
});

// Instance method to get formatted amount
billSchema.methods.getFormattedAmount = function() {
  return `₹${this.amount.toLocaleString('en-IN')}`;
};

// Static method to get user's total spending
billSchema.statics.getUserTotalSpending = async function(userId, startDate, endDate) {
  const matchCriteria = { userId: new mongoose.Types.ObjectId(userId) };
  
  if (startDate || endDate) {
    matchCriteria.date = {};
    if (startDate) matchCriteria.date.$gte = new Date(startDate);
    if (endDate) matchCriteria.date.$lte = new Date(endDate);
  }
  
  const result = await this.aggregate([
    { $match: matchCriteria },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  
  return result.length > 0 ? result[0] : { total: 0, count: 0 };
};

// Static method to get spending by category
billSchema.statics.getSpendingByCategory = async function(userId, startDate, endDate) {
  const matchCriteria = { userId: new mongoose.Types.ObjectId(userId) };
  
  if (startDate || endDate) {
    matchCriteria.date = {};
    if (startDate) matchCriteria.date.$gte = new Date(startDate);
    if (endDate) matchCriteria.date.$lte = new Date(endDate);
  }
  
  return await this.aggregate([
    { $match: matchCriteria },
    { 
      $group: { 
        _id: '$category', 
        total: { $sum: '$amount' }, 
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      } 
    },
    { $sort: { total: -1 } }
  ]);
};

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;
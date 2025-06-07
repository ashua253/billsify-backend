// models/Bill.js - MongoDB Bill model
const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index for faster queries
  },
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
  amount: {
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
  category: {
    type: String,
    default: 'General',
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
      'Other'
    ]
  },
  date: {
    type: Date,
    default: Date.now,
    index: true // Index for date-based queries
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Automatically manage createdAt and updatedAt
});

// Compound index for efficient user-based queries
billSchema.index({ userId: 1, createdAt: -1 });
billSchema.index({ userId: 1, category: 1 });
billSchema.index({ userId: 1, date: -1 });

// Text index for search functionality
billSchema.index({
  deviceName: 'text',
  deviceNumber: 'text',
  remarks: 'text'
});

// Pre-save middleware to ensure amount and deviceCost are in sync
billSchema.pre('save', function(next) {
  // If amount is not set but deviceCost is, sync them
  if (!this.amount && this.deviceCost) {
    this.amount = this.deviceCost;
  }
  // If deviceCost is not set but amount is, sync them
  if (!this.deviceCost && this.amount) {
    this.deviceCost = this.amount;
  }
  
  // Update the updatedAt timestamp
  this.updatedAt = new Date();
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
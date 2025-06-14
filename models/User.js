// models/User.js - Enhanced User model with affiliate support
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // User type: 'user', 'affiliate', 'superadmin'
  userType: {
    type: String,
    enum: ['user', 'affiliate', 'superadmin'],
    default: 'user'
  },
  
  // User status
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'rejected'],
    default: 'active'
  },
  
  // Phone number for all users
  phoneNumber: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Affiliate-specific fields
  affiliateDetails: {
    organizationName: {
      type: String,
      trim: true
    },
    organizationAddress: {
      type: String,
      trim: true
    },
    gstNumber: {
      type: String,
      trim: true,
      default: ''
    },
    businessType: {
      type: String,
      trim: true,
      default: ''
    },
    requiresInventoryManagement: {
      type: Boolean,
      default: false
    },
    // Approval tracking
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
userSchema.index({ email: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ 'affiliateDetails.approvalStatus': 1 });
userSchema.index({ phoneNumber: 1 });

// Instance method to get user profile
userSchema.methods.getPublicProfile = function() {
  const profile = {
    id: this._id,
    email: this.email,
    name: this.name,
    userType: this.userType,
    status: this.status,
    phoneNumber: this.phoneNumber,
    createdAt: this.createdAt
  };
  
  if (this.userType === 'affiliate' && this.affiliateDetails) {
    profile.affiliateDetails = this.affiliateDetails;
  }
  
  return profile;
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to get pending affiliate requests
userSchema.statics.getPendingAffiliateRequests = function() {
  return this.find({
    userType: 'affiliate',
    'affiliateDetails.approvalStatus': 'pending'
  }).sort({ createdAt: -1 });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
// models/User.js - User model for MongoDB
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true // Index for faster queries
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
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Automatically manage createdAt and updatedAt
});

// Index for email lookups (login performance)
userSchema.index({ email: 1 });

// Instance method to get user profile without password
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    createdAt: this.createdAt
  };
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('Environment loaded:', !!process.env.MONGODB_URI);

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' })); // Increase limit for image uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/billapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB Atlas successfully!');
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// User Schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
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
});

// Updated Bill Schema to match your frontend structure
const billSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
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
    index: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
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
  remarks: 'text'
});

// Pre-save middleware to ensure amount and deviceCost are in sync
billSchema.pre('save', function(next) {
  if (!this.amount && this.deviceCost) {
    this.amount = this.deviceCost;
  }
  if (!this.deviceCost && this.amount) {
    this.deviceCost = this.amount;
  }
  this.updatedAt = new Date();
  next();
});

const User = mongoose.model('User', userSchema);
const Bill = mongoose.model('Bill', billSchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// AUTH ROUTES

// Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, username } = req.body;

    // Validation
    if (!email || !password || (!name && !username)) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      name: name || username
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User Profile
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// BILL ROUTES

// Get all bills for authenticated user
app.get('/api/bills', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json({ bills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new bill
app.post('/api/bills', authenticateToken, async (req, res) => {
  try {
    const {
      deviceName,
      deviceNumber,
      deviceCost,
      amount,
      remarks,
      imageUri,
      category,
      date,
      submittedAt
    } = req.body;

    // Validation
    if (!deviceName || !deviceNumber || (!deviceCost && !amount)) {
      return res.status(400).json({ 
        message: 'Device name, number, and cost are required' 
      });
    }

    const billAmount = amount || deviceCost;
    if (isNaN(billAmount) || billAmount <= 0) {
      return res.status(400).json({ 
        message: 'Please provide a valid amount' 
      });
    }

    const bill = new Bill({
      userId: req.user.userId,
      deviceName: deviceName.trim(),
      deviceNumber: deviceNumber.trim(),
      deviceCost: parseFloat(billAmount),
      amount: parseFloat(billAmount),
      remarks: remarks ? remarks.trim() : '',
      imageUri: imageUri || null,
      category: category || 'General',
      date: date ? new Date(date) : new Date(),
      submittedAt: submittedAt ? new Date(submittedAt) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedBill = await bill.save();
    res.status(201).json({ 
      message: 'Bill created successfully', 
      bill: savedBill 
    });
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a bill
app.put('/api/bills/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      deviceName,
      deviceNumber,
      deviceCost,
      amount,
      remarks,
      imageUri,
      category,
      date
    } = req.body;

    // Find bill and verify ownership
    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    if (bill.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update fields
    if (deviceName) bill.deviceName = deviceName.trim();
    if (deviceNumber) bill.deviceNumber = deviceNumber.trim();
    
    const billAmount = amount || deviceCost;
    if (billAmount && !isNaN(billAmount) && billAmount > 0) {
      bill.deviceCost = parseFloat(billAmount);
      bill.amount = parseFloat(billAmount);
    }
    
    if (remarks !== undefined) bill.remarks = remarks.trim();
    if (imageUri !== undefined) bill.imageUri = imageUri;
    if (category) bill.category = category;
    if (date) bill.date = new Date(date);
    
    bill.updatedAt = new Date();

    const updatedBill = await bill.save();
    res.json({ 
      message: 'Bill updated successfully', 
      bill: updatedBill 
    });
  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a bill
app.delete('/api/bills/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Find bill and verify ownership
    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    if (bill.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Bill.findByIdAndDelete(id);
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search bills
app.get('/api/bills/search', authenticateToken, async (req, res) => {
  try {
    const { query, category, startDate, endDate } = req.query;
    let searchCriteria = { userId: req.user.userId };

    // Text search
    if (query) {
      searchCriteria.$or = [
        { deviceName: { $regex: query, $options: 'i' } },
        { deviceNumber: { $regex: query, $options: 'i' } },
        { remarks: { $regex: query, $options: 'i' } }
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      searchCriteria.category = category;
    }

    // Date range filter
    if (startDate || endDate) {
      searchCriteria.date = {};
      if (startDate) {
        searchCriteria.date.$gte = new Date(startDate);
      }
      if (endDate) {
        searchCriteria.date.$lte = new Date(endDate);
      }
    }

    const bills = await Bill.find(searchCriteria).sort({ createdAt: -1 });
    res.json({ bills });
  } catch (error) {
    console.error('Search bills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get bill statistics
app.get('/api/bills/stats', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId });
    
    // Calculate totals by category
    const categoryTotals = {};
    let totalAmount = 0;
    
    bills.forEach(bill => {
      const category = bill.category || 'General';
      const amount = bill.amount || bill.deviceCost || 0;
      
      if (categoryTotals[category]) {
        categoryTotals[category] += amount;
      } else {
        categoryTotals[category] = amount;
      }
      
      totalAmount += amount;
    });

    // Calculate monthly totals
    const monthlyTotals = {};
    bills.forEach(bill => {
      const date = new Date(bill.date || bill.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const amount = bill.amount || bill.deviceCost || 0;
      
      if (monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] += amount;
      } else {
        monthlyTotals[monthKey] = amount;
      }
    });

    res.json({
      totalBills: bills.length,
      totalAmount,
      categoryTotals,
      monthlyTotals,
      averageAmount: bills.length > 0 ? totalAmount / bills.length : 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
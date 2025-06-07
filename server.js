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
app.use(express.json({ limit: '50mb' })); // Increased limit for image data
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

// Updated Bill Schema to match frontend structure
const billSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Backend fields (for compatibility and searching)
  category: {
    type: String,
    required: true,
    enum: ['electronics', 'travel', 'food', 'utilities', 'healthcare', 'other'],
    default: 'other'
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  vendor: String,
  notes: String,
  
  // Frontend-specific data (to maintain compatibility)
  frontendData: {
    deviceName: String,
    deviceNumber: String,
    deviceCost: String,
    remarks: String,
    imageUri: String,
    submittedAt: String
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for better search performance
billSchema.index({ userId: 1, createdAt: -1 });
billSchema.index({ userId: 1, description: 'text', vendor: 'text', notes: 'text' });

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

// Utility function to transform bill for frontend
const transformBillForFrontend = (bill) => {
  return {
    _id: bill._id,
    deviceName: bill.frontendData?.deviceName || bill.description,
    deviceNumber: bill.frontendData?.deviceNumber || bill.vendor,
    deviceCost: bill.frontendData?.deviceCost || bill.amount.toString(),
    remarks: bill.frontendData?.remarks || bill.notes,
    imageUri: bill.frontendData?.imageUri || null,
    submittedAt: bill.frontendData?.submittedAt || bill.date,
    // Keep backend fields for compatibility
    category: bill.category,
    amount: bill.amount,
    description: bill.description,
    date: bill.date,
    createdAt: bill.createdAt
  };
};

// Routes

// Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
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
      name
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

// Bills CRUD Operations

// Get all bills for authenticated user
app.get('/api/bills', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    
    // Transform bills for frontend compatibility
    const transformedBills = bills.map(transformBillForFrontend);
    
    res.json({ bills: transformedBills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new bill
app.post('/api/bills', authenticateToken, async (req, res) => {
  try {
    const { category, amount, description, date, vendor, notes, frontendData } = req.body;

    // Validation - handle both frontend and backend data structures
    const billAmount = amount || (frontendData?.deviceCost ? parseFloat(frontendData.deviceCost) : 0);
    const billDescription = description || frontendData?.deviceName || 'Unknown Device';
    const billDate = date || frontendData?.submittedAt || new Date().toISOString();

    if (!billDescription || billAmount <= 0) {
      return res.status(400).json({ error: 'Description and valid amount are required' });
    }

    const bill = new Bill({
      userId: req.user.userId,
      category: category || 'other',
      amount: billAmount,
      description: billDescription,
      date: new Date(billDate),
      vendor: vendor || frontendData?.deviceNumber || '',
      notes: notes || frontendData?.remarks || '',
      frontendData: frontendData || {
        deviceName: billDescription,
        deviceNumber: vendor || '',
        deviceCost: billAmount.toString(),
        remarks: notes || '',
        imageUri: null,
        submittedAt: billDate
      }
    });

    await bill.save();
    
    // Return transformed bill for frontend
    const transformedBill = transformBillForFrontend(bill);
    
    res.status(201).json({ 
      message: 'Bill created successfully', 
      bill: transformedBill 
    });
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a bill
app.put('/api/bills/:id', authenticateToken, async (req, res) => {
  try {
    const { category, amount, description, date, vendor, notes, frontendData } = req.body;
    
    const updateData = {
      category: category || 'other',
      amount: amount || (frontendData?.deviceCost ? parseFloat(frontendData.deviceCost) : 0),
      description: description || frontendData?.deviceName || 'Unknown Device',
      date: new Date(date || frontendData?.submittedAt || new Date()),
      vendor: vendor || frontendData?.deviceNumber || '',
      notes: notes || frontendData?.remarks || '',
      frontendData: frontendData
    };
    
    const bill = await Bill.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updateData,
      { new: true }
    );

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Return transformed bill for frontend
    const transformedBill = transformBillForFrontend(bill);

    res.json({ 
      message: 'Bill updated successfully', 
      bill: transformedBill 
    });
  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a bill
app.delete('/api/bills/:id', authenticateToken, async (req, res) => {
  try {
    const bill = await Bill.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced search bills with frontend compatibility
app.get('/api/bills/search', authenticateToken, async (req, res) => {
  try {
    const { query, category, startDate, endDate } = req.query;
    let searchCriteria = { userId: req.user.userId };

    if (query) {
      searchCriteria.$or = [
        { description: { $regex: query, $options: 'i' } },
        { vendor: { $regex: query, $options: 'i' } },
        { notes: { $regex: query, $options: 'i' } },
        { 'frontendData.deviceName': { $regex: query, $options: 'i' } },
        { 'frontendData.deviceNumber': { $regex: query, $options: 'i' } },
        { 'frontendData.remarks': { $regex: query, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      searchCriteria.category = category;
    }

    if (startDate && endDate) {
      searchCriteria.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const bills = await Bill.find(searchCriteria).sort({ createdAt: -1 });
    
    // Transform bills for frontend compatibility
    const transformedBills = bills.map(transformBillForFrontend);
    
    res.json({ bills: transformedBills });
  } catch (error) {
    console.error('Search bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bills statistics
app.get('/api/bills/stats', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId });
    
    const stats = {
      totalBills: bills.length,
      totalAmount: bills.reduce((sum, bill) => sum + bill.amount, 0),
      categoryBreakdown: {},
      monthlySpending: {}
    };

    // Calculate category breakdown
    bills.forEach(bill => {
      if (stats.categoryBreakdown[bill.category]) {
        stats.categoryBreakdown[bill.category] += bill.amount;
      } else {
        stats.categoryBreakdown[bill.category] = bill.amount;
      }
    });

    res.json({ stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Billsify Backend Server is running',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Billsify Backend Server is running on port ${PORT}`);
  console.log(`📍 Health check available at: http://localhost:${PORT}/api/health`);
});
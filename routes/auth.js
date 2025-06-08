const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Register User - ENHANCED VERSION
router.post('/register', async (req, res) => {
  try {
    console.log('📥 Registration request received');
    console.log('📄 Request body:', req.body);

    const { email, password, name } = req.body;

    // Enhanced validation with detailed error messages
    if (!name || !name.trim()) {
      console.log('❌ Validation failed: Missing name');
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!email || !email.trim()) {
      console.log('❌ Validation failed: Missing email');
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || !password.trim()) {
      console.log('❌ Validation failed: Missing password');
      return res.status(400).json({ error: 'Password is required' });
    }

    if (password.length < 6) {
      console.log('❌ Validation failed: Password too short');
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Validation failed: Invalid email format');
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const trimmedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();

    console.log('🔍 Checking if user exists with email:', trimmedEmail);

    // Check if user already exists
    const existingUser = await User.findOne({ email: trimmedEmail });
    if (existingUser) {
      console.log('❌ User already exists with email:', trimmedEmail);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    console.log('🔐 Hashing password...');

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    console.log('💾 Creating new user...');

    // Create user
    const user = new User({
      email: trimmedEmail,
      password: hashedPassword,
      name: trimmedName
    });

    const savedUser = await user.save();
    console.log('✅ User created successfully with ID:', savedUser._id);

    // Generate JWT token
    const token = jwt.sign(
      { userId: savedUser._id, email: savedUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('🎫 JWT token generated successfully');

    const responseData = {
      message: 'User registered successfully',
      token,
      user: {
        id: savedUser._id,
        email: savedUser.email,
        name: savedUser.name
      }
    };

    console.log('📤 Sending successful registration response');
    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    
    // Handle duplicate key errors (email already exists)
    if (error.code === 11000) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login User - ENHANCED VERSION
router.post('/login', async (req, res) => {
  try {
    console.log('📥 Login request received');
    console.log('📄 Request body (email only):', { email: req.body.email });

    const { email, password } = req.body;

    // Validation
    if (!email || !email.trim()) {
      console.log('❌ Validation failed: Missing email');
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || !password.trim()) {
      console.log('❌ Validation failed: Missing password');
      return res.status(400).json({ error: 'Password is required' });
    }

    const trimmedEmail = email.toLowerCase().trim();
    console.log('🔍 Looking for user with email:', trimmedEmail);

    // Find user
    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      console.log('❌ User not found with email:', trimmedEmail);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    console.log('👤 User found, checking password...');

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', trimmedEmail);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Password valid, generating token...');

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const responseData = {
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    };

    console.log('📤 Sending successful login response');
    res.json(responseData);

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User Profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    console.log('📥 Profile request for user ID:', req.user.userId);
    
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      console.log('❌ User not found for ID:', req.user.userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('✅ Profile retrieved for user:', user.email);
    res.json({ user });
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
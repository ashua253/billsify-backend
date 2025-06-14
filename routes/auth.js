// routes/auth.js - Enhanced with affiliate registration and super admin features
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Enhanced Register User with User Type Support
router.post('/register', async (req, res) => {
  try {
    console.log('📥 Registration request received');
    console.log('📄 Request body:', req.body);

    const { 
      email, 
      password, 
      name, 
      userType, 
      phoneNumber,
      affiliateDetails 
    } = req.body;

    // Enhanced validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Validate user type
    const validUserTypes = ['user', 'affiliate'];
    const finalUserType = validUserTypes.includes(userType) ? userType : 'user';

    // Additional validation for affiliates
    if (finalUserType === 'affiliate') {
      if (!phoneNumber || !phoneNumber.trim()) {
        return res.status(400).json({ error: 'Phone number is required for affiliates' });
      }
      
      if (!affiliateDetails || !affiliateDetails.organizationName || !affiliateDetails.organizationAddress) {
        return res.status(400).json({ 
          error: 'Organization name and address are required for affiliate registration' 
        });
      }
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

    // Create user object
    const userData = {
      email: trimmedEmail,
      password: hashedPassword,
      name: trimmedName,
      userType: finalUserType,
      phoneNumber: phoneNumber ? phoneNumber.trim() : '',
      status: finalUserType === 'affiliate' ? 'pending' : 'active'
    };

    // Add affiliate details if user is affiliate
    if (finalUserType === 'affiliate' && affiliateDetails) {
      userData.affiliateDetails = {
        organizationName: affiliateDetails.organizationName.trim(),
        organizationAddress: affiliateDetails.organizationAddress.trim(),
        approvalStatus: 'pending'
      };
    }

    const user = new User(userData);
    const savedUser = await user.save();
    
    console.log('✅ User created successfully with ID:', savedUser._id);

    // For affiliates, don't generate token immediately as they need approval
    if (finalUserType === 'affiliate') {
      return res.status(201).json({
        message: 'Affiliate registration submitted successfully. Please wait for admin approval.',
        user: savedUser.getPublicProfile(),
        requiresApproval: true
      });
    }

    // Generate JWT token for regular users
    const token = jwt.sign(
      { userId: savedUser._id, email: savedUser.email, userType: savedUser.userType },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('🎫 JWT token generated successfully');

    const responseData = {
      message: 'User registered successfully',
      token,
      user: savedUser.getPublicProfile()
    };

    console.log('📤 Sending successful registration response');
    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced Login with User Type Support
router.post('/login', async (req, res) => {
  try {
    console.log('📥 Login request received');
    
    const { email, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const trimmedEmail = email.toLowerCase().trim();
    console.log('🔍 Looking for user with email:', trimmedEmail);

    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    console.log('👤 User found, checking password and status...');

    // Check if user is active
    if (user.status === 'inactive') {
      return res.status(400).json({ error: 'Account is deactivated. Please contact support.' });
    }

    if (user.userType === 'affiliate' && user.status === 'pending') {
      return res.status(400).json({ 
        error: 'Your affiliate account is pending approval. Please wait for admin verification.' 
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Password valid, generating token...');

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        userType: user.userType 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const responseData = {
      message: 'Login successful',
      token,
      user: user.getPublicProfile()
    };

    console.log('📤 Sending successful login response');
    res.json(responseData);

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User Profile (Enhanced)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: user.getPublicProfile() });
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Super Admin Routes

// Get pending affiliate requests (Super Admin only)
router.get('/admin/pending-affiliates', authenticateToken, async (req, res) => {
  try {
    // Check if user is super admin
    const adminUser = await User.findById(req.user.userId);
    if (!adminUser || adminUser.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Super admin required.' });
    }

    const pendingAffiliates = await User.getPendingAffiliateRequests();
    res.json({ affiliates: pendingAffiliates });
  } catch (error) {
    console.error('❌ Get pending affiliates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// routes/auth.js - FIXED: Approve/Reject affiliate route
// Add this to your existing auth.js file, replacing the approve-affiliate route

// Approve/Reject affiliate (Super Admin only) - FIXED VERSION
router.post('/admin/approve-affiliate/:affiliateId', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Approve affiliate request received');
    console.log('📝 Affiliate ID from params:', req.params.affiliateId);
    console.log('📝 Request body:', req.body);

    const adminUser = await User.findById(req.user.userId);
    if (!adminUser || adminUser.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Super admin required.' });
    }

    const { action, gstNumber, businessType, requiresInventoryManagement, rejectionReason } = req.body;
    const { affiliateId } = req.params;

    // FIXED: Validate affiliateId
    if (!affiliateId || affiliateId === 'undefined' || affiliateId === 'null') {
      console.error('❌ Invalid affiliate ID:', affiliateId);
      return res.status(400).json({ error: 'Invalid affiliate ID provided' });
    }

    // FIXED: Validate MongoDB ObjectId format
    if (!affiliateId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('❌ Invalid ObjectId format:', affiliateId);
      return res.status(400).json({ error: 'Invalid affiliate ID format' });
    }

    console.log('✅ Searching for affiliate with ID:', affiliateId);

    const affiliate = await User.findById(affiliateId);
    if (!affiliate || affiliate.userType !== 'affiliate') {
      console.error('❌ Affiliate not found or invalid type:', { 
        found: !!affiliate, 
        userType: affiliate?.userType 
      });
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    console.log('✅ Found affiliate:', {
      id: affiliate._id,
      name: affiliate.name,
      email: affiliate.email,
      currentStatus: affiliate.status,
      approvalStatus: affiliate.affiliateDetails?.approvalStatus
    });

    if (action === 'approve') {
      console.log('✅ Approving affiliate...');
      
      affiliate.status = 'active';
      affiliate.affiliateDetails.approvalStatus = 'approved';
      affiliate.affiliateDetails.approvedBy = req.user.userId;
      affiliate.affiliateDetails.approvedAt = new Date();
      
      // Update additional details from onboarding form
      if (gstNumber) affiliate.affiliateDetails.gstNumber = gstNumber;
      if (businessType) affiliate.affiliateDetails.businessType = businessType;
      if (requiresInventoryManagement !== undefined) {
        affiliate.affiliateDetails.requiresInventoryManagement = requiresInventoryManagement;
      }
      
      await affiliate.save();
      
      console.log('✅ Affiliate approved successfully');
      
      res.json({ 
        message: 'Affiliate approved successfully',
        affiliate: affiliate.getPublicProfile()
      });
      
    } else if (action === 'reject') {
      console.log('❌ Rejecting affiliate...');
      
      affiliate.status = 'inactive';
      affiliate.affiliateDetails.approvalStatus = 'rejected';
      affiliate.affiliateDetails.rejectionReason = rejectionReason || 'No reason provided';
      
      await affiliate.save();
      
      console.log('✅ Affiliate rejected successfully');
      
      res.json({ message: 'Affiliate rejected successfully' });
      
    } else {
      console.error('❌ Invalid action:', action);
      res.status(400).json({ error: 'Invalid action. Use approve or reject.' });
    }
    
  } catch (error) {
    console.error('❌ Approve affiliate error:', error);
    
    // Provide more specific error messages
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid affiliate ID format. Please check the ID and try again.' 
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation failed: ' + Object.values(error.errors).map(e => e.message).join(', ')
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all users (Super Admin only)
router.get('/admin/users', authenticateToken, async (req, res) => {
  try {
    const adminUser = await User.findById(req.user.userId);
    if (!adminUser || adminUser.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Super admin required.' });
    }

    const { userType, status, page = 1, limit = 50 } = req.query;
    
    let query = {};
    if (userType) query.userType = userType;
    if (status) query.status = status;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);
    
    res.json({
      users: users.map(user => user.getPublicProfile()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total
      }
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activate/Deactivate user (Super Admin only)
router.post('/admin/toggle-user-status/:userId', authenticateToken, async (req, res) => {
  try {
    const adminUser = await User.findById(req.user.userId);
    if (!adminUser || adminUser.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Super admin required.' });
    }

    const { userId } = req.params;
    const { status } = req.body; // 'active' or 'inactive'

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use active or inactive.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deactivating super admins
    if (user.userType === 'superadmin') {
      return res.status(400).json({ error: 'Cannot modify super admin status' });
    }

    user.status = status;
    await user.save();

    res.json({
      message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('❌ Toggle user status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
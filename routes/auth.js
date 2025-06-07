// routes/auth.js - Authentication Route Handlers
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// These routes handle user authentication operations:

// 1. POST /api/auth/register
// Purpose: Create new user account
router.post('/register', async (req, res) => {
  // - Validate input (email, password, name)
  // - Check if user already exists
  // - Hash password with bcrypt
  // - Save user to database
  // - Generate JWT token
  // - Return token + user info
});

// 2. POST /api/auth/login  
// Purpose: Authenticate existing user
router.post('/login', async (req, res) => {
  // - Validate input (email, password)
  // - Find user in database
  // - Compare password with hashed version
  // - Generate JWT token if valid
  // - Return token + user info
});

// 3. GET /api/auth/profile
// Purpose: Get current user's profile (PROTECTED ROUTE)
router.get('/profile', authenticateToken, async (req, res) => {
  // - Uses authenticateToken middleware
  // - req.user is available from middleware
  // - Fetch user details from database
  // - Return user profile (without password)
});

module.exports = router;

// ENDPOINTS CREATED:
// POST   /api/auth/register   - Create account
// POST   /api/auth/login      - Login user  
// GET    /api/auth/profile    - Get user profile (requires token)
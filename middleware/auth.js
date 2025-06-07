// middleware/auth.js - JWT Token Verification Middleware
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// This middleware runs BEFORE protected routes to verify the user's JWT token
const authenticateToken = (req, res, next) => {
  // 1. Extract token from Authorization header: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // 2. Check if token exists
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // 3. Verify the token is valid and not expired
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    // 4. Add user info to request object for use in route handlers
    req.user = user; // Contains: { userId, email }
    next(); // Continue to the actual route handler
  });
};

module.exports = authenticateToken;

// USAGE EXAMPLE:
// In routes/bills.js:
// router.get('/', authenticateToken, async (req, res) => {
//   // req.user is now available here with { userId, email }
//   const bills = await Bill.find({ userId: req.user.userId });
//   res.json({ bills });
// });
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET_USER = process.env.JWT_SECRET_USER || 'supersecretuserkey';
const JWT_SECRET_ADMIN = process.env.JWT_SECRET_ADMIN || 'supersecretadminkey';
const BCRYPT_SALT_ROUNDS = 10;

// JWT Functions
const generateUserToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET_USER, { expiresIn: '1h' });
};

const generateAdminToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET_ADMIN, { expiresIn: '1h' });
};

const verifyUserToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET_USER);
  } catch (error) {
    return null;
  }
};

const verifyAdminToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET_ADMIN);
  } catch (error) {
    return null;
  }
};

// Bcrypt Functions
const hashPassword = async (password) => {
  return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

module.exports = {
  generateUserToken,
  generateAdminToken,
  verifyUserToken,
  verifyAdminToken,
  hashPassword,
  comparePassword,
};

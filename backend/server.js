require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// MongoDB Connection
mongoose.connect(MONGO_URI, { dbName: 'xjr3' })
  .then(() => logger.info('MongoDB connected...'))
  .catch(err => logger.error(err));

// Middleware
app.use(cors());
app.use(bodyParser.json());

// JWT Authentication Middleware (Basic example, needs refinement)
const authenticateJWT = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// HTTPS Enforcement (for production)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});

// Mount Routes (Placeholder for now)
// app.use('/api/papers', authenticateJWT, require('./routes/papers'));
// app.use('/api/auth', require('./routes/auth'));

app.get('/', (req, res) => {
  res.send('XJR-3 Backend API');
});

app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

const crypto = require('crypto');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

const formatDate = (date, format = 'full') => {
  const d = new Date(date);
  
  const formats = {
    full: { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    },
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    time: { hour: '2-digit', minute: '2-digit' },
    iso: undefined,
  };

  if (format === 'iso') {
    return d.toISOString();
  }

  return d.toLocaleString('en-US', formats[format] || formats.full);
};

const calculateTimeRemaining = (endDate) => {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end - now;

  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { expired: false, days, hours, minutes, seconds };
};

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

const paginate = (array, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      page,
      limit,
      total: array.length,
      totalPages: Math.ceil(array.length / limit),
      hasNext: endIndex < array.length,
      hasPrev: startIndex > 0,
    },
  };
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
};

const maskEmail = (email) => {
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.slice(0, 2) + '*'.repeat(localPart.length - 2);
  return `${maskedLocal}@${domain}`;
};

const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    null;
};

const sortBy = (array, key, order = 'asc') => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (order === 'desc') {
      return bVal > aVal ? 1 : -1;
    }
    return aVal > bVal ? 1 : -1;
  });
};

const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
};

module.exports = {
  generateOTP,
  generateToken,
  formatDate,
  calculateTimeRemaining,
  slugify,
  paginate,
  sanitizeInput,
  maskEmail,
  getClientIP,
  sortBy,
  groupBy,
};

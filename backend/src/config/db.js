const mongoose = require('mongoose');

const getMongoURI = () => {
  // Prefer an explicitly set MONGODB_URI
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  // Railway MongoDB template exposes MONGO_URL directly
  if (process.env.MONGO_URL) {
    return process.env.MONGO_URL;
  }

  // Also accept MONGO_URI (common naming) and fallback typo ONGO_URI if present
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }

  if (process.env.ONGO_URI) {
    return process.env.ONGO_URI;
  }

  // Fall back to constructing a URI from Railway's individual variables:
  // MONGOHOST, MONGOPORT, MONGOUSER, MONGOPASSWORD, MONGODATABASE
  const {
    MONGOHOST,
    MONGOPORT,
    MONGOUSER,
    MONGOPASSWORD,
    MONGODATABASE,
  } = process.env;

  if (MONGOHOST && MONGODATABASE) {
    const auth =
      MONGOUSER && MONGOPASSWORD
        ? `${encodeURIComponent(MONGOUSER)}:${encodeURIComponent(MONGOPASSWORD)}@`
        : '';
    const port = MONGOPORT ? `:${MONGOPORT}` : '';
    return `mongodb://${auth}${MONGOHOST}${port}/${MONGODATABASE}`;
  }

  return null;
};

const connectDB = async () => {
  try {
    const uri = getMongoURI();

    if (!uri) {
      throw new Error(
        'No MongoDB connection string found. Set MONGODB_URI, MONGO_URL, or the individual MONGOHOST/MONGOPORT/MONGOUSER/MONGOPASSWORD/MONGODATABASE variables.'
      );
    }

    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

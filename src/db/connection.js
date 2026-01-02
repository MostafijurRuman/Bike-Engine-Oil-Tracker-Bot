import mongoose from 'mongoose';

export async function connectDb(uri) {
  if (!uri) {
    throw new Error('MongoDB connection string is required');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DB_NAME || 'bike_oil_bot',
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error', err);
  });

  return mongoose.connection;
}

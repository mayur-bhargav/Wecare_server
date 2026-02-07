const mongoose = require('mongoose');
require('dotenv').config();

async function checkData() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wecare');
  
  // Check user data
  const user = await mongoose.connection.db.collection('users').findOne({ 
    _id: new mongoose.Types.ObjectId('6984dd6138569da5c8b8b7a4') 
  });
  console.log('Nanny User nannyProfile:', JSON.stringify(user?.nannyProfile, null, 2));
  
  // Check transactions
  const transactions = await mongoose.connection.db.collection('transactions').find({}).toArray();
  console.log('\nAll Transactions:', transactions.length);
  transactions.forEach(t => {
    console.log(`  - ${t.type}: ₹${t.amount} (${t.status}) - ${t.description}`);
  });
  
  // Check completed bookings
  const bookings = await mongoose.connection.db.collection('bookings').find({ 
    nannyId: new mongoose.Types.ObjectId('6984dd6138569da5c8b8b7a4'),
    status: 'completed'
  }).toArray();
  console.log('\nCompleted Bookings count:', bookings.length);
  bookings.forEach(b => {
    console.log(`  - ${b.bookingId}: ₹${b.totalAmount}`);
  });
  
  await mongoose.disconnect();
}

checkData().catch(console.error);

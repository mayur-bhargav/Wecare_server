require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wecare');
  const User = require('./src/models/User');
  const Booking = require('./src/models/Booking');

  const nannies = await User.find({ role: 'nanny' }).select('name phoneNumber nannyProfile.totalEarnings nannyProfile.availableBalance nannyProfile.totalJobsCompleted');
  console.log('=== NANNIES ===');
  nannies.forEach(n => {
    console.log(n.name, '|', n.phoneNumber, '| totalEarnings:', n.nannyProfile?.totalEarnings, '| balance:', n.nannyProfile?.availableBalance, '| jobs:', n.nannyProfile?.totalJobsCompleted);
  });

  const completed = await Booking.find({ status: 'completed' }).select('nannyId parentId totalAmount status');
  console.log('\n=== COMPLETED BOOKINGS ===');
  completed.forEach(b => console.log('nannyId:', b.nannyId, '| amount:', b.totalAmount, '| status:', b.status));

  const all = await Booking.find({}).select('nannyId status totalAmount');
  console.log('\n=== ALL BOOKINGS ===');
  all.forEach(b => console.log('nannyId:', b.nannyId, '| amount:', b.totalAmount, '| status:', b.status));

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });

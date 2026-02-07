require('dotenv').config();
const mongoose = require('mongoose');
const City = require('./src/models/City');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const count = await City.countDocuments();
  if (count > 0) {
    console.log('Cities already seeded:', count);
    const existing = await City.find().sort({ sortOrder: 1 });
    existing.forEach(c => console.log('  -', c.name, c.isActive ? '(Active)' : '(Coming ' + c.launchDate + ')'));
    await mongoose.disconnect();
    return;
  }

  const cities = [
    {
      name: 'Jaipur', state: 'Rajasthan', pincodePrefix: ['302', '303'],
      isActive: true, sortOrder: 1,
      services: { findNanny: true, daycare: true, elderCare: false, hourlyCare: true, nightCare: true, fullDayCare: true, emergencyCare: false, support: true }
    },
    {
      name: 'Delhi', state: 'Delhi', pincodePrefix: ['110'],
      isActive: false, launchDate: 'Q3 2026', sortOrder: 2,
      services: { findNanny: false, daycare: false, elderCare: false, hourlyCare: false, nightCare: false, fullDayCare: false, emergencyCare: false, support: true }
    },
    {
      name: 'Mumbai', state: 'Maharashtra', pincodePrefix: ['400'],
      isActive: false, launchDate: 'Q4 2026', sortOrder: 3,
      services: { findNanny: false, daycare: false, elderCare: false, hourlyCare: false, nightCare: false, fullDayCare: false, emergencyCare: false, support: true }
    },
    {
      name: 'Bangalore', state: 'Karnataka', pincodePrefix: ['560'],
      isActive: false, launchDate: 'Q4 2026', sortOrder: 4,
      services: { findNanny: false, daycare: false, elderCare: false, hourlyCare: false, nightCare: false, fullDayCare: false, emergencyCare: false, support: true }
    },
    {
      name: 'Hyderabad', state: 'Telangana', pincodePrefix: ['500'],
      isActive: false, launchDate: 'Q1 2027', sortOrder: 5,
      services: { findNanny: false, daycare: false, elderCare: false, hourlyCare: false, nightCare: false, fullDayCare: false, emergencyCare: false, support: true }
    }
  ];

  const result = await City.insertMany(cities);
  console.log('✅ Seeded', result.length, 'cities:');
  result.forEach(c => console.log('  -', c.name, c.isActive ? '(Active)' : '(Coming ' + c.launchDate + ')'));
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });

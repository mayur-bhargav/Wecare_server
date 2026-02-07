const express = require('express');
const router = express.Router();
const City = require('../models/City');

// GET /api/cities — Get all cities
router.get('/', async (req, res) => {
  try {
    const cities = await City.find().sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, data: { cities } });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/cities/active — Get active cities only
router.get('/active', async (req, res) => {
  try {
    const cities = await City.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, data: { cities } });
  } catch (error) {
    console.error('Error fetching active cities:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/cities/upcoming — Get upcoming (non-active) cities
router.get('/upcoming', async (req, res) => {
  try {
    const cities = await City.find({ isActive: false, launchDate: { $ne: '' } })
      .select('name launchDate')
      .sort({ sortOrder: 1 });
    res.json({ success: true, data: { cities } });
  } catch (error) {
    console.error('Error fetching upcoming cities:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/cities/detect/:pincode — Detect city from pincode and return service availability
router.get('/detect/:pincode', async (req, res) => {
  try {
    const { pincode } = req.params;
    if (!pincode || pincode.length < 3) {
      return res.json({
        success: true,
        data: {
          cityConfig: null,
          isAnyServiceActive: false,
          services: {
            findNanny: false, daycare: false, elderCare: false,
            hourlyCare: false, nightCare: false, fullDayCare: false,
            emergencyCare: false, support: false,
          },
        },
      });
    }

    // Try matching with all prefix lengths (3, 4, 5, 6 digits)
    let city = null;
    for (let len = 6; len >= 3; len--) {
      const prefix = pincode.substring(0, len);
      city = await City.findOne({ pincodePrefix: prefix });
      if (city) break;
    }

    if (!city) {
      return res.json({
        success: true,
        data: {
          cityConfig: null,
          isAnyServiceActive: false,
          services: {
            findNanny: false, daycare: false, elderCare: false,
            hourlyCare: false, nightCare: false, fullDayCare: false,
            emergencyCare: false, support: false,
          },
        },
      });
    }

    const services = city.isActive ? city.services : {
      findNanny: false, daycare: false, elderCare: false,
      hourlyCare: false, nightCare: false, fullDayCare: false,
      emergencyCare: false, support: city.services.support,
    };

    const isAnyServiceActive = Object.values(services.toObject ? services.toObject() : services)
      .some(v => v === true);

    res.json({
      success: true,
      data: {
        cityConfig: {
          name: city.name,
          state: city.state,
          isActive: city.isActive,
          launchDate: city.launchDate,
        },
        isAnyServiceActive,
        services: services.toObject ? services.toObject() : services,
      },
    });
  } catch (error) {
    console.error('Error detecting city:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/cities — Create a new city (admin)
router.post('/', async (req, res) => {
  try {
    const { name, state, pincodePrefix, isActive, launchDate, services, sortOrder } = req.body;

    if (!name || !pincodePrefix || !Array.isArray(pincodePrefix)) {
      return res.status(400).json({ success: false, message: 'name and pincodePrefix (array) are required' });
    }

    const existing = await City.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'City already exists' });
    }

    const city = new City({
      name,
      state: state || '',
      pincodePrefix,
      isActive: isActive || false,
      launchDate: launchDate || '',
      services: services || {},
      sortOrder: sortOrder || 0,
    });

    await city.save();
    res.status(201).json({ success: true, message: 'City created', data: { city } });
  } catch (error) {
    console.error('Error creating city:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/cities/:id — Update a city (admin)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const city = await City.findByIdAndUpdate(id, updates, { new: true });
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }

    res.json({ success: true, message: 'City updated', data: { city } });
  } catch (error) {
    console.error('Error updating city:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/cities/:id — Delete a city (admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const city = await City.findByIdAndDelete(id);
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }
    res.json({ success: true, message: 'City deleted' });
  } catch (error) {
    console.error('Error deleting city:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/cities/seed — Seed default cities (one-time setup)
router.post('/seed', async (req, res) => {
  try {
    const existingCount = await City.countDocuments();
    if (existingCount > 0) {
      return res.json({ success: true, message: `Already seeded (${existingCount} cities exist)` });
    }

    const defaultCities = [
      {
        name: 'Jaipur',
        state: 'Rajasthan',
        pincodePrefix: ['302', '303'],
        isActive: true,
        services: {
          findNanny: true, daycare: true, elderCare: false,
          hourlyCare: true, nightCare: true, fullDayCare: true,
          emergencyCare: false, support: true,
        },
        sortOrder: 1,
      },
      {
        name: 'Delhi',
        state: 'Delhi',
        pincodePrefix: ['110'],
        isActive: false,
        launchDate: 'Q3 2026',
        services: {
          findNanny: false, daycare: false, elderCare: false,
          hourlyCare: false, nightCare: false, fullDayCare: false,
          emergencyCare: false, support: true,
        },
        sortOrder: 2,
      },
      {
        name: 'Mumbai',
        state: 'Maharashtra',
        pincodePrefix: ['400'],
        isActive: false,
        launchDate: 'Q4 2026',
        services: {
          findNanny: false, daycare: false, elderCare: false,
          hourlyCare: false, nightCare: false, fullDayCare: false,
          emergencyCare: false, support: true,
        },
        sortOrder: 3,
      },
      {
        name: 'Bangalore',
        state: 'Karnataka',
        pincodePrefix: ['560'],
        isActive: false,
        launchDate: 'Q4 2026',
        services: {
          findNanny: false, daycare: false, elderCare: false,
          hourlyCare: false, nightCare: false, fullDayCare: false,
          emergencyCare: false, support: true,
        },
        sortOrder: 4,
      },
      {
        name: 'Hyderabad',
        state: 'Telangana',
        pincodePrefix: ['500'],
        isActive: false,
        launchDate: 'Q1 2027',
        services: {
          findNanny: false, daycare: false, elderCare: false,
          hourlyCare: false, nightCare: false, fullDayCare: false,
          emergencyCare: false, support: true,
        },
        sortOrder: 5,
      },
    ];

    await City.insertMany(defaultCities);
    res.json({ success: true, message: `Seeded ${defaultCities.length} cities` });
  } catch (error) {
    console.error('Error seeding cities:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

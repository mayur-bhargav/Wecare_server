const express = require('express');
const router = express.Router();
const DaycareProvider = require('../models/DaycareProvider');
const ElderCareProvider = require('../models/ElderCareProvider');
const User = require('../models/User');
const OTP = require('../models/OTP');

// ======================== UNIFIED AUTO-LOGIN ========================

// POST /api/providers/auto-login — Auto-detect provider type and send OTP
router.post('/auto-login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    // Check all 3 collections to find the provider
    let providerType = null;

    const nannyUser = await User.findOne({ phoneNumber, role: 'nanny' });
    if (nannyUser) {
      providerType = 'nanny';
    }

    if (!providerType) {
      const daycareProvider = await DaycareProvider.findOne({ phoneNumber });
      if (daycareProvider) {
        providerType = 'daycare';
      }
    }

    if (!providerType) {
      const elderProvider = await ElderCareProvider.findOne({ phoneNumber });
      if (elderProvider) {
        providerType = 'eldercare';
      }
    }

    if (!providerType) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this phone number. Please register first.',
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.findOneAndUpdate(
      { phoneNumber },
      { phoneNumber, otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`📱 Auto-Login OTP for ${phoneNumber} (${providerType}): ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent',
      data: {
        phoneNumber,
        providerType,
        otp: process.env.NODE_ENV === 'development' ? otp : undefined,
      },
    });
  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/providers/auto-verify — Verify OTP and return provider with type
router.post('/auto-verify', async (req, res) => {
  try {
    const { phoneNumber, otp, fcmToken } = req.body;
    if (!phoneNumber || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP required' });
    }

    const otpDoc = await OTP.findOne({ phoneNumber, otp });
    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await OTP.deleteOne({ _id: otpDoc._id });

    // Find the provider in all 3 collections
    const nannyUser = await User.findOne({ phoneNumber, role: 'nanny' });
    if (nannyUser) {
      nannyUser.lastLogin = new Date();
      // Save FCM token if provided
      if (fcmToken) {
        nannyUser.fcmToken = fcmToken;
      }
      await nannyUser.save();
      return res.json({
        success: true,
        message: 'Login successful',
        data: { provider: nannyUser, providerType: 'nanny' },
      });
    }

    const daycareProvider = await DaycareProvider.findOne({ phoneNumber });
    if (daycareProvider) {
      daycareProvider.lastLogin = new Date();
      // Save FCM token if provided
      if (fcmToken) {
        daycareProvider.fcmToken = fcmToken;
      }
      await daycareProvider.save();
      return res.json({
        success: true,
        message: 'Login successful',
        data: { provider: daycareProvider, providerType: 'daycare' },
      });
    }

    const elderProvider = await ElderCareProvider.findOne({ phoneNumber });
    if (elderProvider) {
      elderProvider.lastLogin = new Date();
      // Save FCM token if provided
      if (fcmToken) {
        elderProvider.fcmToken = fcmToken;
      }
      await elderProvider.save();
      return res.json({
        success: true,
        message: 'Login successful',
        data: { provider: elderProvider, providerType: 'eldercare' },
      });
    }

    return res.status(404).json({ success: false, message: 'Provider not found' });
  } catch (error) {
    console.error('Auto-verify error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ======================== DAYCARE PROVIDER ========================

// POST /api/providers/daycare/register — Register a new daycare center
router.post('/daycare/register', async (req, res) => {
  try {
    const {
      ownerName, phoneNumber, email, centerName, description,
      address, registrationNumber, totalCapacity, ageGroupsAccepted,
      operatingHours, workingDays, pricing, amenities, totalStaff,
    } = req.body;

    if (!ownerName || !phoneNumber || !centerName) {
      return res.status(400).json({
        success: false,
        message: 'ownerName, phoneNumber, and centerName are required',
      });
    }

    // Check if already registered
    const existing = await DaycareProvider.findOne({ phoneNumber });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A daycare is already registered with this phone number',
        data: { provider: existing },
      });
    }

    const provider = new DaycareProvider({
      ownerName, phoneNumber, email, centerName, description,
      address, registrationNumber, totalCapacity, ageGroupsAccepted,
      operatingHours, workingDays, pricing, amenities, totalStaff,
    });

    await provider.save();

    res.status(201).json({
      success: true,
      message: 'Daycare registration submitted. Pending verification.',
      data: { provider },
    });
  } catch (error) {
    console.error('Daycare registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/providers/daycare/login — Login with phone number
router.post('/daycare/login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    const provider = await DaycareProvider.findOne({ phoneNumber });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'No daycare registered with this number' });
    }

    // Generate OTP (reuse existing OTP model)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.findOneAndUpdate(
      { phoneNumber },
      { phoneNumber, otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`📱 Daycare OTP for ${phoneNumber}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent',
      data: { phoneNumber, otp: process.env.NODE_ENV === 'development' ? otp : undefined },
    });
  } catch (error) {
    console.error('Daycare login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/providers/daycare/verify-otp — Verify OTP for daycare login
router.post('/daycare/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const otpDoc = await OTP.findOne({ phoneNumber, otp });
    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await OTP.deleteOne({ _id: otpDoc._id });

    const provider = await DaycareProvider.findOne({ phoneNumber });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    provider.lastLogin = new Date();
    await provider.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: { provider },
    });
  } catch (error) {
    console.error('Daycare OTP verify error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/providers/daycare/:id — Get daycare provider details
router.get('/daycare/:id', async (req, res) => {
  try {
    const provider = await DaycareProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Daycare not found' });
    }
    res.json({ success: true, data: { provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/providers/daycare/:id — Update daycare profile
router.put('/daycare/:id', async (req, res) => {
  try {
    const provider = await DaycareProvider.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Daycare not found' });
    }
    res.json({ success: true, message: 'Profile updated', data: { provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/providers/daycare — List all verified daycares (with city filter)
router.get('/daycare', async (req, res) => {
  try {
    const { city, limit = 20, page = 1 } = req.query;
    const filter = { verificationStatus: 'approved', isActive: true };
    if (city) filter['address.city'] = { $regex: new RegExp(city, 'i') };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const daycares = await DaycareProvider.find(filter)
      .sort({ rating: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DaycareProvider.countDocuments(filter);

    res.json({
      success: true,
      data: {
        daycares,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/providers/daycare/:id/verify — Admin: approve/reject daycare
router.put('/daycare/:id/verify', async (req, res) => {
  try {
    const { status, rejectionReason, adminEstimatedPrice } = req.body; // 'approved' or 'rejected'
    const update = { verificationStatus: status };
    if (status === 'approved') update.isVerified = true;
    if (status === 'rejected') update.rejectionReason = rejectionReason || '';
    if (typeof adminEstimatedPrice === 'number') update.adminEstimatedPrice = adminEstimatedPrice;

    const provider = await DaycareProvider.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Daycare not found' });
    }

    res.json({ success: true, message: `Daycare ${status}`, data: { provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/providers/daycare/pending/list — Admin: list pending daycares
router.get('/daycare/pending/list', async (req, res) => {
  try {
    const pending = await DaycareProvider.find({ verificationStatus: 'pending' }).sort({ createdAt: -1 });
    res.json({ success: true, data: { providers: pending, count: pending.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ======================== ELDER CARE PROVIDER ========================

// POST /api/providers/eldercare/register — Register a new elder caregiver
router.post('/eldercare/register', async (req, res) => {
  try {
    const {
      name, phoneNumber, email, gender, dateOfBirth,
      address, bio, experience, qualifications,
      servicesOffered, languages, availability, pricing, careTypes,
    } = req.body;

    if (!name || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'name and phoneNumber are required',
      });
    }

    const existing = await ElderCareProvider.findOne({ phoneNumber });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An elder caregiver is already registered with this phone number',
        data: { provider: existing },
      });
    }

    const provider = new ElderCareProvider({
      name, phoneNumber, email, gender, dateOfBirth,
      address, bio, experience, qualifications,
      servicesOffered, languages, availability, pricing, careTypes,
    });

    await provider.save();

    res.status(201).json({
      success: true,
      message: 'Elder caregiver registration submitted. Pending verification.',
      data: { provider },
    });
  } catch (error) {
    console.error('Elder care registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/providers/eldercare/login — Login with phone number
router.post('/eldercare/login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    const provider = await ElderCareProvider.findOne({ phoneNumber });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'No elder caregiver registered with this number' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.findOneAndUpdate(
      { phoneNumber },
      { phoneNumber, otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`📱 ElderCare OTP for ${phoneNumber}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent',
      data: { phoneNumber, otp: process.env.NODE_ENV === 'development' ? otp : undefined },
    });
  } catch (error) {
    console.error('Elder care login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/providers/eldercare/verify-otp — Verify OTP for elder care login
router.post('/eldercare/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const otpDoc = await OTP.findOne({ phoneNumber, otp });
    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await OTP.deleteOne({ _id: otpDoc._id });

    const provider = await ElderCareProvider.findOne({ phoneNumber });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    provider.lastLogin = new Date();
    await provider.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: { provider },
    });
  } catch (error) {
    console.error('Elder care OTP verify error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/providers/eldercare/:id — Get elder care provider details
router.get('/eldercare/:id', async (req, res) => {
  try {
    const provider = await ElderCareProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Caregiver not found' });
    }
    res.json({ success: true, data: { provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/providers/eldercare/:id — Update elder care profile
router.put('/eldercare/:id', async (req, res) => {
  try {
    const provider = await ElderCareProvider.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Caregiver not found' });
    }
    res.json({ success: true, message: 'Profile updated', data: { provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/providers/eldercare — List all verified elder caregivers (with city filter)
router.get('/eldercare', async (req, res) => {
  try {
    const { city, limit = 20, page = 1 } = req.query;
    const filter = { verificationStatus: 'approved', isActive: true };
    if (city) filter['address.city'] = { $regex: new RegExp(city, 'i') };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const caregivers = await ElderCareProvider.find(filter)
      .sort({ rating: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ElderCareProvider.countDocuments(filter);

    res.json({
      success: true,
      data: {
        caregivers,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/providers/eldercare/:id/verify — Admin: approve/reject caregiver
router.put('/eldercare/:id/verify', async (req, res) => {
  try {
    const { status, rejectionReason, adminEstimatedPrice } = req.body;
    const update = { verificationStatus: status };
    if (status === 'approved') update.isVerified = true;
    if (status === 'rejected') update.rejectionReason = rejectionReason || '';
    if (typeof adminEstimatedPrice === 'number') update.adminEstimatedPrice = adminEstimatedPrice;

    const provider = await ElderCareProvider.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Caregiver not found' });
    }

    res.json({ success: true, message: `Caregiver ${status}`, data: { provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/providers/eldercare/pending/list — Admin: list pending caregivers
router.get('/eldercare/pending/list', async (req, res) => {
  try {
    const pending = await ElderCareProvider.find({ verificationStatus: 'pending' }).sort({ createdAt: -1 });
    res.json({ success: true, data: { providers: pending, count: pending.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

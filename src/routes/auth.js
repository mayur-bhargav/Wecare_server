const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { admin } = require('../config/firebase');

const router = express.Router();

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Validation middleware
const validatePhone = [
  body('phoneNumber')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid 10-digit Indian mobile number'),
];

const validateOTP = [
  body('phoneNumber')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid 10-digit Indian mobile number'),
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits'),
];

/**
 * @route   POST /api/auth/send-otp
 * @desc    Send OTP to phone number
 * @access  Public
 */
router.post('/send-otp', validatePhone, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { phoneNumber } = req.body;
    const fullPhoneNumber = `+91${phoneNumber}`;

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Delete any existing OTPs for this phone number
    await OTP.deleteMany({ phoneNumber });

    // Save OTP to database
    await OTP.create({
      phoneNumber,
      otp,
      expiresAt,
    });

    // In production, send OTP via Firebase
    // For development, we'll log it
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 OTP for ${fullPhoneNumber}: ${otp}`);
    }

    // TODO: Send OTP via SMS using Firebase or third-party service
    // This is handled on the client side using Firebase Auth phone verification
    // The server stores the OTP for verification

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber,
        expiresIn: 300, // seconds
        // Only include OTP in development for testing
        ...(process.env.NODE_ENV === 'development' && { otp }),
      },
    });
  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.',
    });
  }
});

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and login/register user
 * @access  Public
 */
router.post('/verify-otp', validateOTP, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { phoneNumber, otp, fcmToken } = req.body;

    // Find OTP record
    const otpRecord = await OTP.findOne({ phoneNumber, isUsed: false });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or not found. Please request a new OTP.',
      });
    }

    // Check if OTP is expired
    if (new Date() > otpRecord.expiresAt) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Check max attempts
    if (otpRecord.attempts >= 5) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'Maximum attempts exceeded. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
        attemptsLeft: 5 - otpRecord.attempts,
      });
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // Find or create user
    let user = await User.findOne({ phoneNumber });
    let isNewUser = false;

    console.log('📱 Looking for user with phone:', phoneNumber);
    console.log('📱 Found user:', user ? `ID: ${user._id}, Role: ${user.role}` : 'NOT FOUND');

    if (!user) {
      // Create new user
      user = await User.create({
        phoneNumber,
        isVerified: true,
        fcmToken: fcmToken || '',
      });
      isNewUser = true;
      console.log('📱 Created new user:', user._id);
    } else {
      // Update existing user
      user.isVerified = true;
      user.lastLogin = new Date();
      if (fcmToken) {
        user.fcmToken = fcmToken;
      }
      await user.save();
    }

    // Generate a custom token using Firebase Admin
    let firebaseToken = null;
    try {
      if (admin) {
        firebaseToken = await admin.auth().createCustomToken(user._id.toString());
      }
    } catch (tokenError) {
      console.error('Firebase token generation error:', tokenError);
    }

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      data: {
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          name: user.name || '',
          email: user.email || '',
          role: user.role,
          isProfileComplete: user.isProfileComplete,
          isNewUser,
          // Include nanny profile data if user is a nanny
          ...(user.role === 'nanny' && {
            nannyProfile: user.nannyProfile,
          }),
          // Include children if user is a parent
          ...(user.role === 'parent' && {
            children: user.children,
          }),
          // Include address
          address: user.addresses && user.addresses.length > 0 ? user.addresses[0] : null,
        },
        token: firebaseToken,
      },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP. Please try again.',
    });
  }
});

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Resend OTP to phone number
 * @access  Public
 */
router.post('/resend-otp', validatePhone, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { phoneNumber } = req.body;

    // Delete existing OTPs
    await OTP.deleteMany({ phoneNumber });

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTP.create({
      phoneNumber,
      otp,
      expiresAt,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 Resent OTP for +91${phoneNumber}: ${otp}`);
    }

    res.json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        phoneNumber,
        expiresIn: 300,
        ...(process.env.NODE_ENV === 'development' && { otp }),
      },
    });
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP. Please try again.',
    });
  }
});

/**
 * @route   GET /api/auth/user/:id
 * @desc    Get user by ID
 * @access  Private (TODO: Add auth middleware)
 */
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-fcmToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const userData = user.toObject();
    // Normalize: always include 'id' field
    userData.id = userData._id;

    res.json({
      success: true,
      data: { user: userData },
    });
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
    });
  }
});

/**
 * @route   PUT /api/auth/user/:id/profile
 * @desc    Update user profile (name, email, role, children)
 * @access  Private (TODO: Add auth middleware)
 */
router.put('/user/:id/profile', [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().trim().isEmail().withMessage('Please enter a valid email'),
  body('role').optional().isIn(['parent', 'nanny']).withMessage('Role must be parent or nanny'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { name, email, role, children } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role) user.role = role;
    if (children && Array.isArray(children)) {
      user.children = children.map(child => ({
        name: child.name,
        age: parseInt(child.age) || 0,
        gender: child.gender || '',
      }));
    }
    
    // Check if profile is complete
    user.isProfileComplete = !!(user.name && user.email);
    
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          email: user.email,
          role: user.role,
          children: user.children,
          isProfileComplete: user.isProfileComplete,
          address: user.address,
        },
      },
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
});

/**
 * @route   PUT /api/auth/user/:id/location
 * @desc    Update user location/address - adds new address to addresses array
 * @access  Private (TODO: Add auth middleware)
 */
router.put('/user/:id/location', [
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('pincode').trim().matches(/^\d{6}$/).withMessage('Please enter a valid 6-digit pincode'),
  body('tag').optional().isIn(['home', 'work', 'other']).withMessage('Tag must be home, work, or other'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { street, city, state, pincode, coordinates, formattedAddress, tag = 'home' } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Create new address object
    const newAddress = {
      street: street || '',
      city,
      state,
      pincode,
      coordinates: coordinates || {},
      formattedAddress: formattedAddress || `${street ? street + ', ' : ''}${city}, ${state} - ${pincode}`,
      tag,
      isDefault: false,
      createdAt: new Date(),
    };

    // Initialize addresses array if it doesn't exist
    if (!user.addresses) {
      user.addresses = [];
    }

    // Check if address with same tag exists
    const existingAddressIndex = user.addresses.findIndex(addr => addr.tag === tag);
    
    if (existingAddressIndex !== -1) {
      // Update existing address with same tag
      user.addresses[existingAddressIndex] = newAddress;
    } else {
      // Add new address
      user.addresses.push(newAddress);
    }

    // If this is the first address or user marks it as default, set as default
    if (user.addresses.length === 1) {
      user.addresses[0].isDefault = true;
    }

    // Backward compatibility: Update the legacy address field with the default address
    const defaultAddress = user.addresses.find(addr => addr.isDefault) || user.addresses[0];
    if (defaultAddress) {
      user.address = {
        street: defaultAddress.street,
        city: defaultAddress.city,
        state: defaultAddress.state,
        pincode: defaultAddress.pincode,
        coordinates: defaultAddress.coordinates,
        formattedAddress: defaultAddress.formattedAddress,
      };
    }
    
    await user.save();

    res.json({
      success: true,
      message: 'Address saved successfully',
      data: {
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          email: user.email,
          role: user.role,
          children: user.children,
          isProfileComplete: user.isProfileComplete,
          addresses: user.addresses,
          address: user.address, // Legacy field
        },
      },
    });
  } catch (error) {
    console.error('Update Location Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save address',
    });
  }
});

/**
 * @route   GET /api/auth/user/:id/addresses
 * @desc    Get all addresses for a user
 * @access  Private (TODO: Add auth middleware)
 */
router.get('/user/:id/addresses', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        addresses: user.addresses || [],
      },
    });
  } catch (error) {
    console.error('Get Addresses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get addresses',
    });
  }
});

/**
 * @route   PUT /api/auth/user/:id/address/:addressId/default
 * @desc    Set an address as default
 * @access  Private (TODO: Add auth middleware)
 */
router.put('/user/:id/address/:addressId/default', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find the address to set as default
    const addressToSetDefault = user.addresses.id(req.params.addressId);
    if (!addressToSetDefault) {
      return res.status(404).json({
        success: false,
        message: 'Address not found',
      });
    }

    // Remove default from all addresses
    user.addresses.forEach(addr => {
      addr.isDefault = false;
    });

    // Set the specified address as default
    addressToSetDefault.isDefault = true;

    // Update legacy address field
    user.address = {
      street: addressToSetDefault.street,
      city: addressToSetDefault.city,
      state: addressToSetDefault.state,
      pincode: addressToSetDefault.pincode,
      coordinates: addressToSetDefault.coordinates,
      formattedAddress: addressToSetDefault.formattedAddress,
    };

    await user.save();

    res.json({
      success: true,
      message: 'Default address updated successfully',
      data: {
        addresses: user.addresses,
      },
    });
  } catch (error) {
    console.error('Set Default Address Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address',
    });
  }
});

/**
 * @route   DELETE /api/auth/user/:id/address/:addressId
 * @desc    Delete an address
 * @access  Private (TODO: Add auth middleware)
 */
router.delete('/user/:id/address/:addressId', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find the address to delete
    const addressToDelete = user.addresses.id(req.params.addressId);
    if (!addressToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Address not found',
      });
    }

    // Don't allow deletion if it's the only address
    if (user.addresses.length === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only address',
      });
    }

    const wasDefault = addressToDelete.isDefault;
    
    // Remove the address
    user.addresses.pull(req.params.addressId);

    // If deleted address was default, make the first remaining address default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
      user.address = {
        street: user.addresses[0].street,
        city: user.addresses[0].city,
        state: user.addresses[0].state,
        pincode: user.addresses[0].pincode,
        coordinates: user.addresses[0].coordinates,
        formattedAddress: user.addresses[0].formattedAddress,
      };
    }

    await user.save();

    res.json({
      success: true,
      message: 'Address deleted successfully',
      data: {
        addresses: user.addresses,
      },
    });
  } catch (error) {
    console.error('Delete Address Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address',
    });
  }
});

/**
 * @route   PUT /api/auth/user/:id/nanny-profile
 * @desc    Update nanny profile (for nannies after registration)
 * @access  Private
 */
router.put('/user/:id/nanny-profile', async (req, res) => {
  console.log('=== NANNY PROFILE UPDATE REQUEST ===');
  console.log('User ID:', req.params.id);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { id } = req.params;
    const { bio, experience, hourlyRate, skills, languages, ageGroupsHandled, availability } = req.body;

    console.log('Looking for user with ID:', id);
    const user = await User.findById(id);
    
    if (!user) {
      console.log('ERROR: User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    console.log('Found user:', user.name, 'Role:', user.role);

    // Ensure the user is a nanny
    if (user.role !== 'nanny') {
      console.log('ERROR: User is not a nanny, role is:', user.role);
      return res.status(400).json({
        success: false,
        message: 'Only nanny accounts can update nanny profile',
      });
    }

    console.log('Updating nanny profile...');
    
    // Update nanny profile
    user.nannyProfile = {
      ...user.nannyProfile?.toObject?.() || user.nannyProfile || {},
      bio: bio || '',
      experience: experience || 0,
      hourlyRate: hourlyRate || 0,
      skills: skills || [],
      languages: languages || [],
      ageGroupsHandled: ageGroupsHandled || [],
      availability: availability || {},
      isAvailableNow: true,
      rating: user.nannyProfile?.rating || 0,
      totalReviews: user.nannyProfile?.totalReviews || 0,
      totalJobsCompleted: user.nannyProfile?.totalJobsCompleted || 0,
      isVerifiedNanny: false, // Requires admin approval
      submittedAt: new Date(), // Track when profile was submitted
    };

    // Mark nanny profile as complete (but not verified)
    user.isProfileComplete = true;

    console.log('Saving user...');
    await user.save();
    console.log('User saved successfully');

    res.json({
      success: true,
      message: 'Nanny profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isProfileComplete: user.isProfileComplete,
          nannyProfile: user.nannyProfile,
        },
      },
    });
  } catch (error) {
    console.error('=== NANNY PROFILE UPDATE ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to update nanny profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   PUT /api/auth/admin/verify-nanny/:id
 * @desc    Admin route to verify/approve a nanny
 * @access  Admin only
 */
router.put('/admin/verify-nanny/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, rejectionReason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role !== 'nanny') {
      return res.status(400).json({
        success: false,
        message: 'User is not a nanny',
      });
    }

    if (approved) {
      user.nannyProfile.isVerifiedNanny = true;
      user.nannyProfile.isAvailableNow = true;
      user.nannyProfile.verifiedAt = new Date();
    } else {
      user.nannyProfile.isVerifiedNanny = false;
      user.nannyProfile.rejectionReason = rejectionReason || 'Your application was not approved';
      user.nannyProfile.rejectedAt = new Date();
    }

    await user.save();

    res.json({
      success: true,
      message: approved ? 'Nanny approved successfully' : 'Nanny application rejected',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          nannyProfile: user.nannyProfile,
        },
      },
    });
  } catch (error) {
    console.error('Verify Nanny Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify nanny',
    });
  }
});

/**
 * @route   GET /api/auth/admin/pending-nannies
 * @desc    Get list of nannies pending approval
 * @access  Admin only
 */
router.get('/admin/pending-nannies', async (req, res) => {
  try {
    const pendingNannies = await User.find({
      role: 'nanny',
      isProfileComplete: true,
      'nannyProfile.isVerifiedNanny': false,
    }).select('name email phoneNumber nannyProfile createdAt');

    res.json({
      success: true,
      data: {
        nannies: pendingNannies,
        count: pendingNannies.length,
      },
    });
  } catch (error) {
    console.error('Get Pending Nannies Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending nannies',
    });
  }
});

/**
 * @route   GET /api/auth/nannies
 * @desc    Get list of verified nannies for parents to view
 * @access  Public (authenticated users)
 */
router.get('/nannies', async (req, res) => {
  try {
    const { city, pincode, limit = 20, page = 1 } = req.query;
    
    // Build query for verified nannies
    const query = {
      role: 'nanny',
      isProfileComplete: true,
      'nannyProfile.isVerifiedNanny': true,
    };

    // Optional: filter by city if provided (case-insensitive, partial match)
    // If city filter yields 0 results, we'll retry without it
    let cityFilter = null;
    if (city) {
      cityFilter = { $regex: new RegExp(city, 'i') };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Try with city filter first, fallback to all if no results
    let nannies;
    let total;
    if (cityFilter) {
      const cityQuery = { ...query, 'address.city': cityFilter };
      nannies = await User.find(cityQuery)
        .select('name email phoneNumber profileImage address nannyProfile createdAt')
        .sort({ 'nannyProfile.rating': -1, 'nannyProfile.totalJobsCompleted': -1 })
        .skip(skip)
        .limit(parseInt(limit));
      total = await User.countDocuments(cityQuery);
      
      // If city filter returned no results, fallback to all verified nannies
      if (nannies.length === 0) {
        nannies = await User.find(query)
          .select('name email phoneNumber profileImage address nannyProfile createdAt')
          .sort({ 'nannyProfile.rating': -1, 'nannyProfile.totalJobsCompleted': -1 })
          .skip(skip)
          .limit(parseInt(limit));
        total = await User.countDocuments(query);
      }
    } else {
      nannies = await User.find(query)
        .select('name email phoneNumber profileImage address nannyProfile createdAt')
        .sort({ 'nannyProfile.rating': -1, 'nannyProfile.totalJobsCompleted': -1 })
        .skip(skip)
        .limit(parseInt(limit));
      total = await User.countDocuments(query);
    }

    // Format nanny data for the frontend
    const formattedNannies = nannies.map(nanny => ({
      id: nanny._id,
      name: nanny.name,
      phoneNumber: nanny.phoneNumber,
      profileImage: nanny.profileImage,
      city: nanny.address?.city || 'Jaipur',
      experience: `${nanny.nannyProfile?.experience || 1} yrs`,
      hourlyRate: nanny.nannyProfile?.hourlyRate || 150,
      rating: nanny.nannyProfile?.rating || 0,
      totalReviews: nanny.nannyProfile?.totalReviews || 0,
      totalJobsCompleted: nanny.nannyProfile?.totalJobsCompleted || 0,
      isAvailableNow: nanny.nannyProfile?.isAvailableNow !== false,
      verified: true,
      specializations: nanny.nannyProfile?.skills || [],
      languages: nanny.nannyProfile?.languages || ['Hindi'],
      bio: nanny.nannyProfile?.bio || '',
      ageGroup: nanny.nannyProfile?.ageGroupsHandled || ['Infant', 'Toddler'],
    }));

    res.json({
      success: true,
      data: {
        nannies: formattedNannies,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get Nannies Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get nannies',
    });
  }
});

/**
 * @route   GET /api/auth/nannies/:id
 * @desc    Get single nanny details
 * @access  Public (authenticated users)
 */
router.get('/nannies/:id', async (req, res) => {
  try {
    const nanny = await User.findOne({
      _id: req.params.id,
      role: 'nanny',
      'nannyProfile.isVerifiedNanny': true,
    }).select('name email phoneNumber profileImage address nannyProfile createdAt');

    if (!nanny) {
      return res.status(404).json({
        success: false,
        message: 'Nanny not found',
      });
    }

    res.json({
      success: true,
      data: {
        nanny: {
          id: nanny._id,
          name: nanny.name,
          phoneNumber: nanny.phoneNumber,
          profileImage: nanny.profileImage,
          city: nanny.address?.city || 'Jaipur',
          fullAddress: nanny.address?.formattedAddress,
          experience: nanny.nannyProfile?.experience || '1 year',
          hourlyRate: nanny.nannyProfile?.hourlyRate || 150,
          rating: nanny.nannyProfile?.rating || 0,
          totalReviews: nanny.nannyProfile?.totalReviews || 0,
          totalJobsCompleted: nanny.nannyProfile?.totalJobsCompleted || 0,
          isAvailableNow: nanny.nannyProfile?.isAvailableNow !== false,
          verified: true,
          specializations: nanny.nannyProfile?.specializations || [],
          languages: nanny.nannyProfile?.languages || ['Hindi'],
          bio: nanny.nannyProfile?.bio || '',
          ageGroup: nanny.nannyProfile?.ageGroup || ['Infant', 'Toddler'],
          availability: nanny.nannyProfile?.availability || {},
          documents: nanny.nannyProfile?.documents ? {
            hasAadhar: !!nanny.nannyProfile.documents.aadharNumber,
            hasPhoto: !!nanny.nannyProfile.documents.photoUrl,
          } : {},
        },
      },
    });
  } catch (error) {
    console.error('Get Nanny Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get nanny details',
    });
  }
});

// ===================== PRIVACY & SECURITY ROUTES =====================

/**
 * @route   GET /api/auth/user/:id/privacy-settings
 * @desc    Get user's privacy & security settings
 */
router.get('/user/:id/privacy-settings', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const settings = user.privacySettings || {
      biometricLogin: false,
      profileVisibility: true,
      showPhoneNumber: false,
      locationSharing: true,
      pushNotifications: true,
      emailNotifications: true,
      dataCollection: true,
      securityPin: '',
    };

    res.json({
      success: true,
      message: 'Privacy settings retrieved',
      data: {
        settings: {
          biometricLogin: settings.biometricLogin || false,
          profileVisibility: settings.profileVisibility !== false,
          showPhoneNumber: settings.showPhoneNumber || false,
          locationSharing: settings.locationSharing !== false,
          pushNotifications: settings.pushNotifications !== false,
          emailNotifications: settings.emailNotifications !== false,
          dataCollection: settings.dataCollection !== false,
          hasSecurityPin: !!settings.securityPin,
        },
      },
    });
  } catch (error) {
    console.error('Get Privacy Settings Error:', error);
    res.status(500).json({ success: false, message: 'Failed to get privacy settings' });
  }
});

/**
 * @route   PUT /api/auth/user/:id/privacy-settings
 * @desc    Update user's privacy & security settings
 */
router.put('/user/:id/privacy-settings', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.privacySettings) {
      user.privacySettings = {};
    }

    const allowedFields = [
      'biometricLogin', 'profileVisibility', 'showPhoneNumber',
      'locationSharing', 'pushNotifications', 'emailNotifications', 'dataCollection',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        user.privacySettings[field] = req.body[field];
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Privacy settings updated',
      data: {
        settings: {
          biometricLogin: user.privacySettings.biometricLogin || false,
          profileVisibility: user.privacySettings.profileVisibility !== false,
          showPhoneNumber: user.privacySettings.showPhoneNumber || false,
          locationSharing: user.privacySettings.locationSharing !== false,
          pushNotifications: user.privacySettings.pushNotifications !== false,
          emailNotifications: user.privacySettings.emailNotifications !== false,
          dataCollection: user.privacySettings.dataCollection !== false,
          hasSecurityPin: !!user.privacySettings.securityPin,
        },
      },
    });
  } catch (error) {
    console.error('Update Privacy Settings Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update privacy settings' });
  }
});

/**
 * @route   PUT /api/auth/user/:id/security-pin
 * @desc    Set or update security PIN
 */
router.put('/user/:id/security-pin', async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;

    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.privacySettings) {
      user.privacySettings = {};
    }

    // If user already has a PIN, verify the current PIN
    if (user.privacySettings.securityPin && user.privacySettings.securityPin !== currentPin) {
      return res.status(400).json({ success: false, message: 'Current PIN is incorrect' });
    }

    user.privacySettings.securityPin = newPin;
    await user.save();

    res.json({
      success: true,
      message: user.privacySettings.securityPin ? 'Security PIN updated' : 'Security PIN set',
    });
  } catch (error) {
    console.error('Set Security PIN Error:', error);
    res.status(500).json({ success: false, message: 'Failed to set security PIN' });
  }
});

/**
 * @route   DELETE /api/auth/user/:id/security-pin
 * @desc    Remove security PIN
 */
router.delete('/user/:id/security-pin', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.privacySettings || !user.privacySettings.securityPin) {
      return res.status(400).json({ success: false, message: 'No security PIN found' });
    }

    user.privacySettings.securityPin = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Security PIN removed successfully',
    });
  } catch (error) {
    console.error('Remove Security PIN Error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove security PIN' });
  }
});

/**
 * @route   POST /api/auth/user/:id/verify-pin
 * @desc    Verify security PIN (for app unlock)
 */
router.post('/user/:id/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.privacySettings?.securityPin) {
      return res.status(400).json({ success: false, message: 'No security PIN set' });
    }

    if (user.privacySettings.securityPin !== pin) {
      return res.status(400).json({ success: false, message: 'Incorrect PIN' });
    }

    res.json({ success: true, message: 'PIN verified' });
  } catch (error) {
    console.error('Verify PIN Error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify PIN' });
  }
});

/**
 * @route   PUT /api/auth/user/:id/deactivate
 * @desc    Deactivate user account (soft disable)
 */
router.put('/user/:id/deactivate', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isDeactivated = true;
    await user.save();

    res.json({ success: true, message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Deactivate Account Error:', error);
    res.status(500).json({ success: false, message: 'Failed to deactivate account' });
  }
});

/**
 * @route   DELETE /api/auth/user/:id
 * @desc    Permanently delete user account and all associated data
 */
router.delete('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete associated bookings
    const Booking = require('../models/Booking');
    if (user.role === 'parent') {
      await Booking.deleteMany({ parentId: user._id });
    } else if (user.role === 'nanny') {
      await Booking.deleteMany({ nannyId: user._id });
    }

    // Delete associated transactions
    const Transaction = require('../models/Transaction');
    await Transaction.deleteMany({ userId: user._id });

    // Delete the user
    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Account permanently deleted' });
  } catch (error) {
    console.error('Delete Account Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
});

/**
 * @route   GET /api/auth/user/:id/download-data
 * @desc    Download all personal data for a user (GDPR-style)
 */
router.get('/user/:id/download-data', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const Booking = require('../models/Booking');
    const Transaction = require('../models/Transaction');

    const bookings = await Booking.find({
      $or: [{ parentId: user._id }, { nannyId: user._id }],
    }).lean();

    const transactions = await Transaction.find({ userId: user._id }).lean();

    const userData = user.toObject();
    delete userData.__v;

    res.json({
      success: true,
      message: 'Personal data retrieved',
      data: {
        personalInfo: {
          name: userData.name,
          email: userData.email,
          phoneNumber: userData.phoneNumber,
          role: userData.role,
          children: userData.children,
          addresses: userData.addresses,
          createdAt: userData.createdAt,
        },
        privacySettings: userData.privacySettings,
        bookings: bookings.length,
        transactions: transactions.length,
        exportedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Download Data Error:', error);
    res.status(500).json({ success: false, message: 'Failed to download data' });
  }
});

module.exports = router;

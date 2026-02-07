const mongoose = require('mongoose');

const daycareProviderSchema = new mongoose.Schema({
  // Owner/Manager info
  ownerName: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  countryCode: {
    type: String,
    default: '+91',
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
  },
  profileImage: {
    type: String,
    default: '',
  },

  // Daycare center details
  centerName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    formattedAddress: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
  },

  // Business details
  registrationNumber: {
    type: String,
    default: '',
  },
  gstNumber: {
    type: String,
    default: '',
  },
  establishedYear: {
    type: Number,
    default: 0,
  },

  // Capacity and age groups
  totalCapacity: {
    type: Number,
    default: 0,
  },
  currentOccupancy: {
    type: Number,
    default: 0,
  },
  ageGroupsAccepted: [{
    type: String, // 'infant' (0-1), 'toddler' (1-3), 'preschool' (3-5), 'school-age' (5+)
  }],

  // Timing
  operatingHours: {
    openTime: { type: String, default: '08:00 AM' },
    closeTime: { type: String, default: '06:00 PM' },
  },
  workingDays: [{
    type: String, // 'monday', 'tuesday', etc.
  }],

  // Pricing
  pricing: [{
    planName: String,    // e.g. "Monthly Full Day", "Half Day"
    duration: String,    // e.g. "1 month", "per day"
    price: Number,
    description: String,
  }],
  // Admin-only estimated price (displayed to users)
  adminEstimatedPrice: {
    type: Number,
    default: 0,
  },

  // Amenities and features
  amenities: [{
    type: String, // 'cctv', 'ac', 'play-area', 'meals', 'transport', 'music-classes', etc.
  }],

  // Staff
  totalStaff: {
    type: Number,
    default: 0,
  },

  // Photos
  photos: [{
    url: String,
    caption: String,
    publicId: String,
    uploadedAt: { type: Date, default: Date.now },
  }],

  // Documents
  documents: {
    license: String,
    safetyCompliance: String,
    healthInspection: String,
    fireSafety: String,
  },

  // Ratings
  rating: {
    type: Number,
    default: 0,
  },
  totalReviews: {
    type: Number,
    default: 0,
  },

  // Verification & Status
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
    default: '',
  },

  // Financial
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    upiId: String,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  availableBalance: {
    type: Number,
    default: 0,
  },

  // App-specific
  fcmToken: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

daycareProviderSchema.index({ phoneNumber: 1 });
daycareProviderSchema.index({ 'address.city': 1 });
daycareProviderSchema.index({ verificationStatus: 1 });

const DaycareProvider = mongoose.model('DaycareProvider', daycareProviderSchema);

module.exports = DaycareProvider;

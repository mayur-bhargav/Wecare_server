const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
  name: {
    type: String,
    trim: true,
    default: '',
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
  role: {
    type: String,
    enum: ['parent', 'nanny', 'admin'],
    default: 'parent',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isProfileComplete: {
    type: Boolean,
    default: false,
  },
  children: [{
    name: String,
    age: Number,
    gender: String,
  }],
  // Nanny-specific fields
  nannyProfile: {
    bio: {
      type: String,
      default: '',
    },
    experience: {
      type: Number,  // Years of experience
      default: 0,
    },
    hourlyRate: {
      type: Number,
      default: 0,
    },
    skills: [{
      type: String,
    }],
    languages: [{
      type: String,
    }],
    ageGroupsHandled: [{
      type: String,  // 'infant', 'toddler', 'preschool', 'school-age'
    }],
    availability: {
      monday: { available: { type: Boolean, default: true }, startTime: String, endTime: String },
      tuesday: { available: { type: Boolean, default: true }, startTime: String, endTime: String },
      wednesday: { available: { type: Boolean, default: true }, startTime: String, endTime: String },
      thursday: { available: { type: Boolean, default: true }, startTime: String, endTime: String },
      friday: { available: { type: Boolean, default: true }, startTime: String, endTime: String },
      saturday: { available: { type: Boolean, default: false }, startTime: String, endTime: String },
      sunday: { available: { type: Boolean, default: false }, startTime: String, endTime: String },
    },
    isAvailableNow: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    totalJobsCompleted: {
      type: Number,
      default: 0,
    },
    // Earnings tracking
    totalEarnings: {
      type: Number,
      default: 0,
    },
    availableBalance: {
      type: Number,
      default: 0,
    },
    withdrawnAmount: {
      type: Number,
      default: 0,
    },
    documents: {
      idProof: String,
      addressProof: String,
      policeClearance: String,
    },
    isVerifiedNanny: {
      type: Boolean,
      default: false,
    },
  },
  addresses: [{
    street: String,
    city: String,
    state: String,
    pincode: String,
    formattedAddress: String,
    tag: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home'
    },
    coordinates: {
      lat: Number,
      lng: Number,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Legacy field for backward compatibility (will be removed later)
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
  // Privacy & Security settings
  privacySettings: {
    biometricLogin: { type: Boolean, default: false },
    profileVisibility: { type: Boolean, default: true },
    showPhoneNumber: { type: Boolean, default: false },
    locationSharing: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    dataCollection: { type: Boolean, default: true },
    securityPin: { type: String, default: '' },
  },
  isDeactivated: {
    type: Boolean,
    default: false,
  },
  favoriteNannies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  fcmToken: {
    type: String,
    default: '',
  },
  // Bank details for withdrawals
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    upiId: String,
    updatedAt: Date,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Index for faster phone number lookups
userSchema.index({ phoneNumber: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;

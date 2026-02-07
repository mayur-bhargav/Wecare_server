const mongoose = require('mongoose');

const elderCareProviderSchema = new mongoose.Schema({
  // Caregiver info
  name: {
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
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: 'female',
  },
  dateOfBirth: {
    type: Date,
  },

  // Address
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

  // Professional details
  bio: {
    type: String,
    default: '',
  },
  experience: {
    type: Number, // Years
    default: 0,
  },
  qualifications: [{
    type: String, // e.g. 'Nursing Diploma', 'Geriatric Care Cert', 'First Aid'
  }],

  // Services offered
  servicesOffered: [{
    type: String, // 'medical-care', 'personal-care', 'meal-prep', 'mobility', 'companionship', 'post-surgery'
  }],

  // Languages
  languages: [{
    type: String,
  }],

  // Availability
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

  // Pricing
  pricing: {
    hourlyRate: { type: Number, default: 250 },
    halfDayRate: { type: Number, default: 1200 },
    fullDayRate: { type: Number, default: 2000 },
    liveInRate: { type: Number, default: 3500 },
  },
  // Admin-only estimated price (displayed to users)
  adminEstimatedPrice: {
    type: Number,
    default: 0,
  },

  // Care type preferences
  careTypes: [{
    type: String, // 'hourly', 'half-day', 'full-day', 'live-in'
  }],

  // Documents
  documents: {
    idProof: String,
    addressProof: String,
    medicalCertificate: String,
    policeClearance: String,
    qualificationCerts: [String],
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
  totalJobsCompleted: {
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
  withdrawnAmount: {
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

elderCareProviderSchema.index({ phoneNumber: 1 });
elderCareProviderSchema.index({ 'address.city': 1 });
elderCareProviderSchema.index({ verificationStatus: 1 });

const ElderCareProvider = mongoose.model('ElderCareProvider', elderCareProviderSchema);

module.exports = ElderCareProvider;

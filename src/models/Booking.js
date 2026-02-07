const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Unique booking ID (e.g., WC12345678)
  bookingId: {
    type: String,
    required: true,
    unique: true,
  },
  // Parent who made the booking
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Nanny being booked
  nannyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Booking date
  date: {
    type: Date,
    required: true,
  },
  // Start time (e.g., "09:00 AM")
  startTime: {
    type: String,
    required: true,
  },
  // End time (e.g., "05:00 PM")
  endTime: {
    type: String,
    required: true,
  },
  // Total hours
  totalHours: {
    type: Number,
    required: true,
  },
  // Children info
  children: [{
    name: String,
    age: Number,
    gender: String,
  }],
  numberOfChildren: {
    type: Number,
    required: true,
    default: 1,
  },
  childrenAges: {
    type: String,
    default: '',
  },
  // Service address
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
  // Special instructions
  specialInstructions: {
    type: String,
    default: '',
  },
  // Pricing
  hourlyRate: {
    type: Number,
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  // Booking status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending',
  },
  // Cancellation details
  cancellation: {
    cancelledBy: {
      type: String,
      enum: ['parent', 'nanny', 'admin', null],
      default: null,
    },
    reason: String,
    cancelledAt: Date,
  },
  // Payment details
  payment: {
    status: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    method: {
      type: String,
      enum: ['cash', 'online', 'wallet'],
      default: 'cash',
    },
    paidAt: Date,
    transactionId: String,
    razorpayOrderId: String,
  },
  // Ratings (after completion)
  rating: {
    byParent: {
      score: { type: Number, min: 1, max: 5 },
      review: String,
      ratedAt: Date,
    },
    byNanny: {
      score: { type: Number, min: 1, max: 5 },
      review: String,
      ratedAt: Date,
    },
  },
  // Completion verification
  completionVerification: {
    otp: String,
    otpExpiry: Date,
    otpVerified: { type: Boolean, default: false },
    verificationImage: String, // URL or base64 of image with child
    verifiedAt: Date,
    qrToken: String,
    qrExpiry: Date,
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  confirmedAt: Date,
  completedAt: Date,
});

// Generate unique booking ID
bookingSchema.statics.generateBookingId = function() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `WC${timestamp}${random}`;
};

// Index for efficient queries
bookingSchema.index({ parentId: 1, createdAt: -1 });
bookingSchema.index({ nannyId: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ date: 1 });
bookingSchema.index({ bookingId: 1 });

// Update timestamp on save
bookingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;

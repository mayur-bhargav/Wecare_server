const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // Reference to the booking this review is for
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  // Parent who wrote the review
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Nanny being reviewed
  nannyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Daycare being reviewed
  daycareId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DaycareProvider',
  },
  // Rating (1-5)
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  // Review comment
  comment: {
    type: String,
    default: '',
    maxlength: 500,
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
});

// Ensure one review per booking
reviewSchema.index({ bookingId: 1 }, { unique: true });
// For fetching all reviews for a nanny
reviewSchema.index({ nannyId: 1, createdAt: -1 });
// For fetching all reviews for a daycare
reviewSchema.index({ daycareId: 1, createdAt: -1 });
// For fetching all reviews by a parent
reviewSchema.index({ parentId: 1, createdAt: -1 });

// Update timestamp on save
reviewSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // User who made the transaction
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Transaction type
  type: {
    type: String,
    enum: ['earning', 'withdrawal', 'refund'],
    required: true,
  },
  // Amount
  amount: {
    type: Number,
    required: true,
  },
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending',
  },
  // Description
  description: {
    type: String,
    default: '',
  },
  // Reference to booking (for earnings)
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
  },
  // Withdrawal details
  withdrawalDetails: {
    method: {
      type: String,
      enum: ['bank', 'upi'],
    },
    bankDetails: {
      accountHolderName: String,
      accountNumber: String,
      ifscCode: String,
      bankName: String,
    },
    upiId: String,
    transactionId: String,
    processedAt: Date,
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

// Index for efficient queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });

// Update timestamp on save
transactionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

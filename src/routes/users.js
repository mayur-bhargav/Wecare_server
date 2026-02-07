const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');

const router = express.Router();

/**
 * UPI Verification Configuration
 * 
 * For REAL UPI verification, you need to use a payment gateway API.
 * Options (all paid per verification, ~₹1-2 per call):
 * 
 * 1. Cashfree - https://www.cashfree.com/
 *    - Sign up at https://merchant.cashfree.com/
 *    - Get API keys from Dashboard > Developers > API Keys
 *    - Sandbox is FREE for testing
 * 
 * 2. Razorpay - https://razorpay.com/
 *    - Sign up at https://dashboard.razorpay.com/
 *    - Enable "Fund Account Validation" feature
 * 
 * Set these environment variables:
 * UPI_VERIFICATION_PROVIDER=cashfree (or razorpay)
 * CASHFREE_APP_ID=your_app_id
 * CASHFREE_SECRET_KEY=your_secret_key
 * CASHFREE_ENV=sandbox (or production)
 */

const UPI_VERIFICATION_CONFIG = {
  provider: process.env.UPI_VERIFICATION_PROVIDER || 'simulation', // 'cashfree', 'razorpay', or 'simulation'
  cashfree: {
    appId: process.env.CASHFREE_APP_ID || '',
    secretKey: process.env.CASHFREE_SECRET_KEY || '',
    baseUrl: process.env.CASHFREE_ENV === 'production' 
      ? 'https://api.cashfree.com' 
      : 'https://sandbox.cashfree.com',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  }
};

/**
 * Verify UPI using Cashfree API (Real verification)
 * Documentation: https://docs.cashfree.com/docs/upi-verification
 */
async function verifyCashfree(upiId) {
  const { appId, secretKey, baseUrl } = UPI_VERIFICATION_CONFIG.cashfree;
  
  if (!appId || !secretKey) {
    throw new Error('Cashfree credentials not configured');
  }

  const response = await fetch(`${baseUrl}/verification/upi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': appId,
      'x-client-secret': secretKey,
    },
    body: JSON.stringify({
      upi: upiId,
    }),
  });

  const data = await response.json();
  
  if (data.status === 'SUCCESS' && data.valid) {
    return {
      verified: true,
      name: data.name_at_bank || data.account_holder || 'Account Holder',
      bank: data.upi_registered || 'UPI Account',
    };
  } else {
    return {
      verified: false,
      error: data.message || 'UPI verification failed',
    };
  }
}

/**
 * Verify UPI using Razorpay API (Real verification)
 * Documentation: https://razorpay.com/docs/api/x/fund-accounts/validation/
 */
async function verifyRazorpay(upiId) {
  const { keyId, keySecret } = UPI_VERIFICATION_CONFIG.razorpay;
  
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  
  // First create a fund account
  const response = await fetch('https://api.razorpay.com/v1/fund_accounts/validations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({
      type: 'vpa',
      vpa: {
        address: upiId,
      },
    }),
  });

  const data = await response.json();
  
  if (data.status === 'completed' && data.results?.account_status === 'active') {
    return {
      verified: true,
      name: data.results?.registered_name || 'Account Holder',
      bank: 'UPI Account',
    };
  } else {
    return {
      verified: false,
      error: data.error?.description || 'UPI verification failed',
    };
  }
}

/**
 * UPI Provider to Bank Mapping (for simulation mode)
 */
const UPI_PROVIDERS = {
  'paytm': 'Paytm Payments Bank',
  'ybl': 'Yes Bank',
  'okhdfcbank': 'HDFC Bank',
  'okaxis': 'Axis Bank',
  'oksbi': 'State Bank of India',
  'okicici': 'ICICI Bank',
  'axl': 'Axis Bank',
  'ibl': 'ICICI Bank',
  'sbi': 'State Bank of India',
  'upi': 'NPCI UPI',
  'apl': 'Amazon Pay',
  'yapl': 'Amazon Pay (Yes Bank)',
  'rapl': 'Amazon Pay (RBL Bank)',
  'gpay': 'Google Pay (Axis Bank)',
  'waicici': 'WhatsApp Pay (ICICI)',
  'wasbi': 'WhatsApp Pay (SBI)',
  'waaxis': 'WhatsApp Pay (Axis)',
  'fbl': 'Federal Bank',
  'idfcbank': 'IDFC First Bank',
  'rbl': 'RBL Bank',
  'icici': 'ICICI Bank',
  'hdfc': 'HDFC Bank',
  'axis': 'Axis Bank',
  'kotak': 'Kotak Mahindra Bank',
  'indus': 'IndusInd Bank',
  'pnb': 'Punjab National Bank',
  'boi': 'Bank of India',
  'bob': 'Bank of Baroda',
  'citi': 'Citibank',
  'hsbc': 'HSBC Bank',
  'sc': 'Standard Chartered',
  'dbs': 'DBS Bank',
  'bandhan': 'Bandhan Bank',
  'jupiter': 'Jupiter (Federal Bank)',
  'fi': 'Fi Money (Federal Bank)',
  'slice': 'Slice (ICICI Bank)',
  'cred': 'CRED (Axis Bank)',
  'postbank': 'India Post Payments Bank',
  'airtel': 'Airtel Payments Bank',
  'jio': 'Jio Payments Bank',
  'phonepe': 'PhonePe (Yes Bank)',
  'yesbank': 'Yes Bank',
  'axisbank': 'Axis Bank',
  'hdfcbank': 'HDFC Bank',
  'sbiupi': 'State Bank of India',
  'iciciupi': 'ICICI Bank'
};

/**
 * Simulation mode - generates name from UPI ID
 * Used when no payment gateway is configured
 */
function verifySimulation(upiId) {
  const userPart = upiId.split('@')[0];
  const handle = upiId.split('@')[1].toLowerCase();
  
  // Clean up the user part - remove numbers and special chars
  const cleanName = userPart
    .replace(/[0-9._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  let formattedName = 'Account Holder';
  if (cleanName.length >= 2) {
    formattedName = cleanName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  const bankName = UPI_PROVIDERS[handle] || 'UPI Account';
  
  return {
    verified: true,
    name: formattedName,
    bank: bankName,
    isSimulated: true,
  };
}

/**
 * @route   POST /api/users/verify-upi
 * @desc    Verify UPI ID and return account holder name from NPCI/BHIM
 * @access  Public
 * 
 * For REAL verification, configure environment variables:
 * - UPI_VERIFICATION_PROVIDER=cashfree
 * - CASHFREE_APP_ID=your_app_id
 * - CASHFREE_SECRET_KEY=your_secret_key
 */
router.post('/verify-upi', [
  body('upiId').notEmpty().withMessage('UPI ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { upiId } = req.body;
    
    // Validate UPI format
    const upiRegex = /^[\w.-]+@[\w.-]+$/;
    if (!upiRegex.test(upiId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UPI ID format',
      });
    }

    let result;
    const provider = UPI_VERIFICATION_CONFIG.provider;

    console.log(`UPI Verification - Provider: ${provider}, UPI: ${upiId}`);

    try {
      if (provider === 'cashfree') {
        // Real verification using Cashfree
        result = await verifyCashfree(upiId);
      } else if (provider === 'razorpay') {
        // Real verification using Razorpay
        result = await verifyRazorpay(upiId);
      } else {
        // Simulation mode (no API configured)
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
        result = verifySimulation(upiId);
        console.log('⚠️  UPI Verification running in SIMULATION mode');
        console.log('   To enable real verification, set environment variables:');
        console.log('   UPI_VERIFICATION_PROVIDER=cashfree');
        console.log('   CASHFREE_APP_ID=your_app_id');
        console.log('   CASHFREE_SECRET_KEY=your_secret_key');
      }
    } catch (apiError) {
      console.error('Payment gateway error:', apiError.message);
      // Fallback to simulation if API fails
      result = verifySimulation(upiId);
      result.fallback = true;
    }

    if (result.verified) {
      res.json({
        success: true,
        data: {
          verified: true,
          upiId: upiId,
          name: result.name,
          bank: result.bank,
          provider: provider,
          isSimulated: result.isSimulated || false,
          message: result.isSimulated 
            ? 'UPI format validated (simulation mode - configure API for real KYC)' 
            : 'UPI ID verified successfully via NPCI',
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'UPI verification failed. Please check the UPI ID.',
      });
    }
  } catch (error) {
    console.error('UPI Verification Error:', error);
    res.status(500).json({
      success: false,
      message: 'UPI verification failed. Please try again.',
    });
  }
});

/**
 * @route   GET /api/users/:id/bank-details
 * @desc    Get user's saved bank details
 * @access  Private
 */
router.get('/:id/bank-details', async (req, res) => {
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
        bankDetails: user.bankDetails || null,
      },
    });
  } catch (error) {
    console.error('Get Bank Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bank details',
    });
  }
});

/**
 * @route   PUT /api/users/:id/bank-details
 * @desc    Save/Update user's bank details
 * @access  Private
 */
router.put('/:id/bank-details', async (req, res) => {
  try {
    const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.bankDetails = {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      upiId,
      updatedAt: new Date(),
    };

    await user.save();

    res.json({
      success: true,
      message: 'Bank details saved successfully',
      data: {
        bankDetails: user.bankDetails,
      },
    });
  } catch (error) {
    console.error('Save Bank Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save bank details',
    });
  }
});

/**
 * @route   POST /api/users/:id/withdraw
 * @desc    Request a withdrawal
 * @access  Private
 */
router.post('/:id/withdraw', [
  body('amount').isNumeric().withMessage('Amount is required'),
  body('method').isIn(['bank', 'upi']).withMessage('Invalid withdrawal method'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { amount, method, bankDetails } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user has sufficient balance
    const availableBalance = user.nannyProfile?.availableBalance || 0;
    if (amount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance',
      });
    }

    // Minimum withdrawal amount
    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹100',
      });
    }

    // Create withdrawal transaction
    const transaction = await Transaction.create({
      userId,
      type: 'withdrawal',
      amount,
      status: 'pending',
      description: method === 'bank' 
        ? `Withdrawal to ${bankDetails.bankName} - ${bankDetails.accountNumber.slice(-4)}`
        : `Withdrawal to UPI - ${bankDetails.upiId}`,
      withdrawalDetails: {
        method,
        ...(method === 'bank' ? { bankDetails } : { upiId: bankDetails.upiId }),
      },
    });

    // Update user's available balance
    user.nannyProfile.availableBalance -= amount;
    user.nannyProfile.withdrawnAmount = (user.nannyProfile.withdrawnAmount || 0) + amount;

    // Save bank details for future use
    if (method === 'bank') {
      user.bankDetails = {
        ...user.bankDetails,
        accountHolderName: bankDetails.accountHolderName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
        bankName: bankDetails.bankName,
        updatedAt: new Date(),
      };
    } else {
      user.bankDetails = {
        ...user.bankDetails,
        upiId: bankDetails.upiId,
        updatedAt: new Date(),
      };
    }

    await user.save();

    // In production, this would trigger the actual withdrawal process
    // For now, we'll mark it as completed after a simulated delay
    setTimeout(async () => {
      try {
        transaction.status = 'completed';
        transaction.withdrawalDetails.processedAt = new Date();
        transaction.withdrawalDetails.transactionId = `TXN${Date.now()}`;
        await transaction.save();
        console.log(`✅ Withdrawal ${transaction._id} completed`);
      } catch (err) {
        console.error('Error completing withdrawal:', err);
      }
    }, 2000);

    console.log(`💸 Withdrawal request: ₹${amount} to ${method} for user ${userId}`);

    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: {
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          status: transaction.status,
          method: method,
          createdAt: transaction.createdAt,
        },
        newBalance: user.nannyProfile.availableBalance,
      },
    });
  } catch (error) {
    console.error('Withdraw Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal',
    });
  }
});

/**
 * @route   GET /api/users/:id/transactions
 * @desc    Get user's transaction history
 * @access  Private
 */
router.get('/:id/transactions', async (req, res) => {
  try {
    const { type = 'all', limit = 50, page = 1 } = req.query;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Build query - convert userId string to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const query = { userId: userObjectId };
    if (type === 'earnings') {
      query.type = 'earning';
    } else if (type === 'withdrawals') {
      query.type = 'withdrawal';
    }

    // Get transactions from Transaction model
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Also get completed bookings as earnings if not specifically filtered
    let allTransactions = [...transactions];

    if (type === 'all' || type === 'earnings') {
      // Get completed bookings for this nanny that don't have a transaction entry yet
      const completedBookings = await Booking.find({
        nannyId: userId,
        status: 'completed',
      })
        .populate('parentId', 'name')
        .sort({ completedAt: -1 })
        .limit(parseInt(limit));

      // Convert bookings to transaction format
      const earningTransactions = completedBookings.map(booking => ({
        id: booking._id,
        type: 'earning',
        amount: booking.totalAmount,
        status: 'completed',
        description: `Booking with ${booking.parentId?.name || 'Parent'}`,
        bookingId: booking.bookingId,
        createdAt: booking.completedAt || booking.createdAt,
      }));

      // Merge and sort all transactions
      allTransactions = [
        ...transactions.map(t => ({
          id: t._id,
          type: t.type,
          amount: t.amount,
          status: t.status,
          description: t.description,
          bookingId: t.bookingId?.bookingId,
          withdrawalMethod: t.withdrawalDetails?.method,
          createdAt: t.createdAt,
        })),
        ...earningTransactions,
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Remove duplicates (in case booking was already recorded as transaction)
      const seen = new Set();
      allTransactions = allTransactions.filter(t => {
        if (t.bookingId) {
          if (seen.has(t.bookingId)) return false;
          seen.add(t.bookingId);
        }
        return true;
      });
    }

    const total = allTransactions.length;

    res.json({
      success: true,
      data: {
        transactions: allTransactions.slice(0, parseInt(limit)),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get Transactions Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
    });
  }
});

/**
 * @route   GET /api/users/:id/earnings-summary
 * @desc    Get user's earnings summary
 * @access  Private
 */
router.get('/:id/earnings-summary', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get pending withdrawals
    const pendingWithdrawals = await Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: 'withdrawal',
          status: 'pending',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalEarnings: user.nannyProfile?.totalEarnings || 0,
          availableBalance: user.nannyProfile?.availableBalance || 0,
          withdrawnAmount: user.nannyProfile?.withdrawnAmount || 0,
          pendingWithdrawals: pendingWithdrawals[0]?.total || 0,
          totalJobsCompleted: user.nannyProfile?.totalJobsCompleted || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get Earnings Summary Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings summary',
    });
  }
});

/**
 * @route   GET /api/users/:id/reviews
 * @desc    Get nanny's reviews from parents
 * @access  Private
 */
router.get('/:id/reviews', async (req, res) => {
  try {
    const userId = req.params.id;

    // First try the Review collection (new system)
    let Review;
    try {
      Review = require('../models/Review');
    } catch (e) {
      Review = null;
    }

    let reviews = [];
    let distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRating = 0;

    if (Review) {
      // Fetch from Review collection
      const reviewDocs = await Review.find({ nannyId: userId })
        .populate('parentId', 'name profileImage')
        .sort({ createdAt: -1 });

      reviews = reviewDocs.map(r => ({
        _id: r._id,
        parent: r.parentId ? { name: r.parentId.name, profileImage: r.parentId.profileImage } : null,
        rating: r.rating,
        comment: r.comment || '',
        createdAt: r.createdAt,
        booking: { bookingId: r.bookingId },
      }));
    }

    // Also check bookings with inline ratings (old system fallback)
    const bookingsWithReviews = await Booking.find({
      nannyId: userId,
      status: 'completed',
      'rating.byParent.score': { $exists: true },
    })
    .populate('parentId', 'name profileImage')
    .sort({ 'rating.byParent.ratedAt': -1 });

    // Merge booking inline reviews (avoid duplicates)
    const existingBookingIds = new Set(reviews.map(r => r.booking?.bookingId?.toString()));
    bookingsWithReviews.forEach(booking => {
      if (!existingBookingIds.has(booking._id.toString())) {
        reviews.push({
          _id: booking._id,
          parent: booking.parentId ? { name: booking.parentId.name, profileImage: booking.parentId.profileImage } : null,
          rating: booking.rating?.byParent?.score || 0,
          comment: booking.rating?.byParent?.review || '',
          createdAt: booking.rating?.byParent?.ratedAt || booking.completedAt,
          booking: {
            bookingId: booking.bookingId,
            childAge: booking.childAge,
          },
        });
      }
    });

    // Calculate stats
    const totalReviews = reviews.length;
    reviews.forEach(r => {
      totalRating += r.rating;
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating]++;
      }
    });

    const averageRating = totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0;

    res.json({
      success: true,
      data: {
        reviews,
        stats: {
          averageRating,
          totalReviews,
          ratingDistribution: distribution,
        },
      },
    });
  } catch (error) {
    console.error('Get Reviews Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
    });
  }
});

/**
 * @route   GET /api/users/:id/schedule
 * @desc    Get nanny's weekly schedule
 * @access  Private
 */
router.get('/:id/schedule', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        schedule: user.nannyProfile?.availability || {},
        isAvailableNow: user.nannyProfile?.isAvailableNow ?? true,
      },
    });
  } catch (error) {
    console.error('Get Schedule Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schedule',
    });
  }
});

/**
 * @route   PUT /api/users/:id/schedule
 * @desc    Update nanny's weekly schedule
 * @access  Private
 */
router.put('/:id/schedule', async (req, res) => {
  try {
    const userId = req.params.id;
    const { schedule } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.nannyProfile) {
      user.nannyProfile = {};
    }

    user.nannyProfile.availability = schedule;
    await user.save();

    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data: {
        schedule: user.nannyProfile.availability,
      },
    });
  } catch (error) {
    console.error('Update Schedule Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update schedule',
    });
  }
});

/**
 * @route   PUT /api/users/:id/availability-status
 * @desc    Update nanny's "Available Now" status
 * @access  Private
 */
router.put('/:id/availability-status', async (req, res) => {
  try {
    const userId = req.params.id;
    const { isAvailableNow } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.nannyProfile) {
      user.nannyProfile = {};
    }

    user.nannyProfile.isAvailableNow = isAvailableNow;
    await user.save();

    res.json({
      success: true,
      message: `You are now ${isAvailableNow ? 'available' : 'unavailable'} for bookings`,
      data: {
        isAvailableNow: user.nannyProfile.isAvailableNow,
      },
    });
  } catch (error) {
    console.error('Update Availability Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability status',
    });
  }
});

// ===================== FAVORITE NANNIES =====================

/**
 * GET /:userId/favorites - Get favorite nannies
 */
router.get('/:userId/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate({
      path: 'favoriteNannies',
      select: 'name phoneNumber profileImage nannyProfile address',
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const favorites = (user.favoriteNannies || []).map(n => ({
      _id: n._id,
      id: n._id,
      name: n.name,
      profileImage: n.profileImage,
      city: n.address?.city || '',
      hourlyRate: n.nannyProfile?.hourlyRate || 0,
      rating: n.nannyProfile?.rating || 0,
      totalReviews: n.nannyProfile?.totalReviews || 0,
      experience: n.nannyProfile?.experience ? `${n.nannyProfile.experience} yrs` : '0 yrs',
      isAvailableNow: n.nannyProfile?.isAvailableNow || false,
      verified: n.nannyProfile?.isVerifiedNanny || false,
      totalJobsCompleted: n.nannyProfile?.totalJobsCompleted || 0,
    }));

    res.json({ success: true, data: { favorites } });
  } catch (error) {
    console.error('Get Favorites Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch favorites' });
  }
});

/**
 * POST /:userId/favorites/toggle - Toggle favorite nanny
 */
router.post('/:userId/favorites/toggle', async (req, res) => {
  try {
    const { nannyId } = req.body;
    if (!nannyId) {
      return res.status(400).json({ success: false, message: 'nannyId is required' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const index = (user.favoriteNannies || []).findIndex(
      id => id.toString() === nannyId
    );

    let isFavorite;
    if (index === -1) {
      user.favoriteNannies = user.favoriteNannies || [];
      user.favoriteNannies.push(nannyId);
      isFavorite = true;
    } else {
      user.favoriteNannies.splice(index, 1);
      isFavorite = false;
    }

    await user.save();

    res.json({
      success: true,
      data: { isFavorite },
      message: isFavorite ? 'Added to favorites' : 'Removed from favorites',
    });
  } catch (error) {
    console.error('Toggle Favorite Error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle favorite' });
  }
});

module.exports = router;

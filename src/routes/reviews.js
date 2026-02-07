const express = require('express');
const { body, validationResult } = require('express-validator');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const User = require('../models/User');
const DaycareProvider = require('../models/DaycareProvider');

const router = express.Router();

/**
 * @route   POST /api/reviews
 * @desc    Submit a review for a completed booking
 * @access  Private (parent only)
 */
router.post('/', [
  body('bookingId').notEmpty().withMessage('Booking ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
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

    const { bookingId, rating, comment } = req.body;

    // Verify booking exists and is completed
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings',
      });
    }

    // Check if already reviewed this specific booking
    const existingReview = await Review.findOne({ bookingId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this booking',
      });
    }

    // Check if parent has already reviewed this nanny (across any booking)
    const existingNannyReview = await Review.findOne({
      parentId: booking.parentId,
      nannyId: booking.nannyId,
    });
    if (existingNannyReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this nanny',
      });
    }

    // Create the review
    const review = await Review.create({
      bookingId: booking._id,
      parentId: booking.parentId,
      nannyId: booking.nannyId,
      rating,
      comment: comment || '',
    });

    // Also update the booking's rating field
    booking.rating = booking.rating || {};
    booking.rating.byParent = {
      score: rating,
      review: comment || '',
      ratedAt: new Date(),
    };
    await booking.save();

    // Update nanny's average rating & total reviews
    const allReviews = await Review.find({ nannyId: booking.nannyId });
    const totalReviews = allReviews.length;
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;

    await User.findByIdAndUpdate(booking.nannyId, {
      'nannyProfile.rating': Math.round(avgRating * 10) / 10,
      'nannyProfile.totalReviews': totalReviews,
    });

    // Populate parent info for response
    await review.populate('parentId', 'name profileImage');

    console.log(`⭐ Review submitted for nanny ${booking.nannyId}: ${rating}/5`);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          comment: review.comment,
          parentName: review.parentId?.name || 'Parent',
          createdAt: review.createdAt,
        },
        nannyStats: {
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews,
        },
      },
    });
  } catch (error) {
    console.error('Submit Review Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this booking',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
    });
  }
});

/**
 * @route   GET /api/reviews/nanny/:nannyId
 * @desc    Get all reviews for a nanny
 * @access  Public
 */
router.get('/nanny/:nannyId', async (req, res) => {
  try {
    const { nannyId } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const reviews = await Review.find({ nannyId })
      .populate('parentId', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Review.countDocuments({ nannyId });

    // Calculate rating distribution
    const allReviews = await Review.find({ nannyId });
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allReviews.forEach(r => {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    });

    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0;

    res.json({
      success: true,
      data: {
        reviews: reviews.map(r => ({
          id: r._id,
          rating: r.rating,
          comment: r.comment,
          parentName: r.parentId?.name || 'Parent',
          parentImage: r.parentId?.profileImage || null,
          createdAt: r.createdAt,
        })),
        stats: {
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews: total,
          distribution,
        },
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get Nanny Reviews Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
    });
  }
});

/**
 * @route   GET /api/reviews/booking/:bookingId
 * @desc    Check if a booking has been reviewed
 * @access  Private
 */
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const review = await Review.findOne({ bookingId })
      .populate('parentId', 'name profileImage');

    if (!review) {
      return res.json({
        success: true,
        data: { reviewed: false, review: null },
      });
    }

    res.json({
      success: true,
      data: {
        reviewed: true,
        review: {
          id: review._id,
          rating: review.rating,
          comment: review.comment,
          parentName: review.parentId?.name || 'Parent',
          createdAt: review.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Check Review Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check review status',
    });
  }
});

/**
 * @route   GET /api/reviews/parent/:parentId/reviewed-nannies
 * @desc    Get list of nanny IDs this parent has already reviewed
 * @access  Private
 */
router.get('/parent/:parentId/reviewed-nannies', async (req, res) => {
  try {
    const { parentId } = req.params;
    const reviews = await Review.find({ parentId }).select('nannyId');
    const reviewedNannyIds = reviews.map(r => r.nannyId.toString());
    
    res.json({
      success: true,
      data: { reviewedNannyIds },
    });
  } catch (error) {
    console.error('Get Reviewed Nannies Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reviewed nannies',
    });
  }
});

// ======================== DAYCARE REVIEWS ========================

/**
 * @route   GET /api/reviews/daycare/:daycareId
 * @desc    Get all reviews for a daycare provider
 */
router.get('/daycare/:daycareId', async (req, res) => {
  try {
    const { daycareId } = req.params;
    const reviews = await Review.find({ daycareId })
      .populate('parentId', 'name profileImage')
      .sort({ createdAt: -1 });

    const formattedReviews = reviews.map(r => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      parent: r.parentId ? { name: r.parentId.name, profileImage: r.parentId.profileImage } : null,
    }));

    // Stats
    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews : 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

    res.json({
      success: true,
      data: {
        reviews: formattedReviews,
        stats: {
          averageRating: Math.round(avgRating * 10) / 10,
          totalReviews,
          ratingDistribution: distribution,
        },
      },
    });
  } catch (error) {
    console.error('Get daycare reviews error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

module.exports = router;

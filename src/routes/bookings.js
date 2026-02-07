const express = require('express');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const NotificationService = require('../services/notificationService');

const router = express.Router();

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking
 * @access  Private (parent only)
 */
router.post('/', [
  body('parentId').notEmpty().withMessage('Parent ID is required'),
  body('nannyId').notEmpty().withMessage('Nanny ID is required'),
  body('date').notEmpty().withMessage('Date is required'),
  body('startTime').notEmpty().withMessage('Start time is required'),
  body('endTime').notEmpty().withMessage('End time is required'),
  body('totalHours').isNumeric().withMessage('Total hours must be a number'),
  body('totalAmount').isNumeric().withMessage('Total amount must be a number'),
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

    const {
      parentId,
      nannyId,
      date,
      startTime,
      endTime,
      totalHours,
      children,
      numberOfChildren,
      childrenAges,
      address,
      specialInstructions,
      hourlyRate,
      totalAmount,
    } = req.body;

    // Verify parent exists
    const parent = await User.findById(parentId);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found',
      });
    }

    // Verify nanny exists and is a verified nanny
    const nanny = await User.findById(nannyId);
    if (!nanny) {
      return res.status(404).json({
        success: false,
        message: 'Nanny not found',
      });
    }

    if (nanny.role !== 'nanny') {
      return res.status(400).json({
        success: false,
        message: 'Selected user is not a nanny',
      });
    }

    // Check for overlapping bookings for this nanny on the same date
    const bookingDate = new Date(date);
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await Booking.find({
      nannyId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'confirmed'] },
    });

    // Parse time helper (handles "2:00 PM" and "14:00" formats)
    const parseTimeStr = (timeStr) => {
      const match12 = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match12) {
        let h = parseInt(match12[1], 10);
        const meridian = match12[3].toUpperCase();
        if (meridian === 'PM' && h !== 12) h += 12;
        if (meridian === 'AM' && h === 12) h = 0;
        return h;
      }
      return parseInt(timeStr.split(':')[0], 10);
    };

    const newStart = parseTimeStr(startTime);
    const newEnd = parseTimeStr(endTime);

    const hasOverlap = existingBookings.some(booking => {
      const existStart = parseTimeStr(booking.startTime);
      const existEnd = parseTimeStr(booking.endTime);
      // Overlap: newStart < existEnd AND newEnd > existStart
      return newStart < existEnd && newEnd > existStart;
    });

    if (hasOverlap) {
      return res.status(400).json({
        success: false,
        message: 'This nanny is already booked for the selected time slot. Please choose a different time.',
      });
    }

    // Generate unique booking ID
    const bookingId = Booking.generateBookingId();

    // Create booking
    const booking = await Booking.create({
      bookingId,
      parentId,
      nannyId,
      date: new Date(date),
      startTime,
      endTime,
      totalHours,
      children: children || [],
      numberOfChildren: numberOfChildren || 1,
      childrenAges: childrenAges || '',
      address: address || {},
      specialInstructions: specialInstructions || '',
      hourlyRate: hourlyRate || 0,
      totalAmount,
      status: 'pending',
    });

    // Populate nanny details for response
    await booking.populate('nannyId', 'name phoneNumber profileImage');
    await booking.populate('parentId', 'name phoneNumber');

    console.log(`📅 New booking created: ${bookingId} by ${parent.name} for nanny ${nanny.name}`);

    // Send push notification to nanny
    NotificationService.notifyNewBooking(booking, parent, nanny)
      .then(result => console.log('📲 Notification sent to nanny:', result.success))
      .catch(err => console.error('Notification error:', err));

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking: {
          id: booking._id,
          bookingId: booking.bookingId,
          parentId: booking.parentId,
          nannyId: booking.nannyId,
          nannyName: nanny.name,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalHours: booking.totalHours,
          children: booking.children,
          numberOfChildren: booking.numberOfChildren,
          childrenAges: booking.childrenAges,
          address: booking.address,
          specialInstructions: booking.specialInstructions,
          hourlyRate: booking.hourlyRate,
          totalAmount: booking.totalAmount,
          status: booking.status,
          createdAt: booking.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Create Booking Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
    });
  }
});

/**
 * @route   GET /api/bookings/parent/:parentId
 * @desc    Get all bookings for a parent
 * @access  Private
 */
router.get('/parent/:parentId', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { status, limit = 20, page = 1 } = req.query;

    const query = { parentId };
    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate('nannyId', 'name phoneNumber profileImage nannyProfile.rating')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: {
        bookings: bookings.map(booking => ({
          id: booking._id,
          bookingId: booking.bookingId,
          nanny: booking.nannyId ? {
            id: booking.nannyId._id,
            name: booking.nannyId.name,
            phoneNumber: booking.nannyId.phoneNumber,
            profileImage: booking.nannyId.profileImage,
            rating: booking.nannyId.nannyProfile?.rating || 0,
          } : null,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalHours: booking.totalHours,
          numberOfChildren: booking.numberOfChildren,
          childrenAges: booking.childrenAges,
          children: booking.children,
          address: booking.address,
          totalAmount: booking.totalAmount,
          hourlyRate: booking.hourlyRate,
          status: booking.status,
          payment: booking.payment || { status: 'pending', method: 'cash' },
          rating: booking.rating || {},
          createdAt: booking.createdAt,
        })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get Parent Bookings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
    });
  }
});

/**
 * @route   GET /api/bookings/nanny/:nannyId/booked-slots
 * @desc    Get booked time slots for a nanny on a specific date
 * @access  Public (for booking flow)
 */
router.get('/nanny/:nannyId/booked-slots', async (req, res) => {
  try {
    const { nannyId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required (YYYY-MM-DD)',
      });
    }

    const bookingDate = new Date(date);
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      nannyId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'confirmed'] },
    }).select('startTime endTime');

    const bookedSlots = bookings.map(b => ({
      startTime: b.startTime,
      endTime: b.endTime,
    }));

    res.json({
      success: true,
      data: { bookedSlots },
    });
  } catch (error) {
    console.error('Get Booked Slots Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booked slots',
    });
  }
});

/**
 * @route   GET /api/bookings/nanny/:nannyId
 * @desc    Get all bookings for a nanny
 * @access  Private
 */
router.get('/nanny/:nannyId', async (req, res) => {
  try {
    const { nannyId } = req.params;
    const { status, limit = 20, page = 1 } = req.query;

    console.log('🔍 Fetching bookings for nannyId:', nannyId);

    const query = { nannyId };
    if (status) {
      query.status = status;
    }

    // Debug: Get all bookings first to see what's in the database
    const allBookings = await Booking.find({}).select('nannyId bookingId status');
    console.log('📦 All bookings in DB:', allBookings.map(b => ({ nannyId: b.nannyId?.toString(), bookingId: b.bookingId, status: b.status })));

    const bookings = await Booking.find(query)
      .populate('parentId', 'name phoneNumber profileImage')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    console.log('✅ Found bookings for this nanny:', bookings.length);

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: {
        bookings: bookings.map(booking => ({
          _id: booking._id,
          bookingId: booking.bookingId,
          parent: booking.parentId ? {
            id: booking.parentId._id,
            name: booking.parentId.name,
            phoneNumber: booking.parentId.phoneNumber,
            profileImage: booking.parentId.profileImage,
          } : null,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalHours: booking.totalHours,
          children: booking.children || [],
          numberOfChildren: booking.numberOfChildren,
          childrenAges: booking.childrenAges,
          address: booking.address,
          specialInstructions: booking.specialInstructions,
          hourlyRate: booking.hourlyRate,
          totalAmount: booking.totalAmount,
          status: booking.status,
          payment: booking.payment,
          createdAt: booking.createdAt,
          confirmedAt: booking.confirmedAt,
          completedAt: booking.completedAt,
        })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get Nanny Bookings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
    });
  }
});

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking by ID
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('parentId', 'name phoneNumber profileImage')
      .populate('nannyId', 'name phoneNumber profileImage nannyProfile');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    res.json({
      success: true,
      data: { booking },
    });
  } catch (error) {
    console.error('Get Booking Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
    });
  }
});

/**
 * @route   PUT /api/bookings/:id/status
 * @desc    Update booking status
 * @access  Private
 */
router.put('/:id/status', [
  body('status').isIn(['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'rejected'])
    .withMessage('Invalid status'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { status, cancelledBy, cancellationReason } = req.body;

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Update status
    booking.status = status;

    // Handle specific status updates
    if (status === 'confirmed') {
      booking.confirmedAt = new Date();
      
      // Send notification to parent that booking is confirmed
      const parent = await User.findById(booking.parentId);
      const nanny = await User.findById(booking.nannyId);
      if (parent && nanny) {
        NotificationService.notifyBookingConfirmed(booking, parent, nanny)
          .then(result => console.log('📲 Confirmation notification sent to parent:', result.success))
          .catch(err => console.error('Notification error:', err));
      }
    } else if (status === 'completed') {
      booking.completedAt = new Date();
      
      // Send notification for completed booking
      const parent = await User.findById(booking.parentId);
      const nanny = await User.findById(booking.nannyId);
      if (parent && nanny) {
        NotificationService.notifyBookingCompleted(booking, parent, nanny)
          .then(result => console.log('📲 Completion notification sent:', result.success))
          .catch(err => console.error('Notification error:', err));
      }
    } else if (status === 'cancelled') {
      booking.cancellation = {
        cancelledBy: cancelledBy || 'parent',
        reason: cancellationReason || '',
        cancelledAt: new Date(),
      };
      
      // Send cancellation notification
      const parent = await User.findById(booking.parentId);
      const nanny = await User.findById(booking.nannyId);
      if (parent && nanny) {
        NotificationService.notifyBookingCancelled(booking, cancelledBy || 'parent', parent, nanny)
          .then(result => console.log('📲 Cancellation notification sent:', result.success))
          .catch(err => console.error('Notification error:', err));
      }
    } else if (status === 'rejected') {
      // Send rejection notification to parent
      const parent = await User.findById(booking.parentId);
      const nanny = await User.findById(booking.nannyId);
      if (parent && nanny) {
        NotificationService.notifyBookingRejected(booking, parent, nanny, cancellationReason)
          .then(result => console.log('📲 Rejection notification sent to parent:', result.success))
          .catch(err => console.error('Notification error:', err));
      }
    }

    await booking.save();

    res.json({
      success: true,
      message: `Booking ${status} successfully`,
      data: { booking },
    });
  } catch (error) {
    console.error('Update Booking Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
    });
  }
});

/**
 * @route   PUT /api/bookings/:id/cancel
 * @desc    Cancel a booking
 * @access  Private
 */
router.put('/:id/cancel', async (req, res) => {
  try {
    const { cancelledBy, reason } = req.body;

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${booking.status} booking`,
      });
    }

    // Enforce 4-hour cancellation cutoff
    if (booking.date && booking.startTime) {
      // Parse time - handles both "14:00" and "2:00 PM" formats
      let hours = 0, minutes = 0;
      const match12 = booking.startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match12) {
        hours = parseInt(match12[1], 10);
        minutes = parseInt(match12[2], 10);
        const meridian = match12[3].toUpperCase();
        if (meridian === 'PM' && hours !== 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;
      } else {
        const parts = booking.startTime.split(':').map(Number);
        hours = parts[0] || 0;
        minutes = parts[1] || 0;
      }
      const bookingDate = new Date(booking.date);
      bookingDate.setHours(hours, minutes, 0, 0);
      const now = new Date();
      const hoursUntilBooking = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilBooking <= 4) {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel within 4 hours of the booking start time',
        });
      }
    }

    booking.status = 'cancelled';
    booking.cancellation = {
      cancelledBy: cancelledBy || 'parent',
      reason: reason || '',
      cancelledAt: new Date(),
    };

    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: { booking },
    });
  } catch (error) {
    console.error('Cancel Booking Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
    });
  }
});

/**
 * @route   POST /api/bookings/:id/send-completion-otp
 * @desc    Send OTP to parent for booking completion verification
 * @access  Private (nanny only)
 */
router.post('/:id/send-completion-otp', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('parentId', 'name phoneNumber');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (!['confirmed', 'in-progress'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed or in-progress bookings can be completed',
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Save OTP to booking
    booking.completionVerification = {
      otp,
      otpExpiry,
      otpVerified: false,
    };
    await booking.save();

    // In production, send OTP via SMS to parent's phone
    console.log(`📱 Completion OTP for booking ${booking.bookingId}: ${otp}`);
    console.log(`📱 Sending to parent: ${booking.parentId?.name} - ${booking.parentId?.phoneNumber}`);

    // TODO: Integrate with SMS service (Firebase, Twilio, etc.)
    // await sendSMS(booking.parentId.phoneNumber, `Your WeCare booking completion OTP is: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent to parent successfully',
      data: {
        parentName: booking.parentId?.name,
        parentPhone: booking.parentId?.phoneNumber?.replace(/\d(?=\d{4})/g, '*'), // Masked phone
        expiresIn: '10 minutes',
        // For testing only - remove in production
        testOtp: otp,
      },
    });
  } catch (error) {
    console.error('Send Completion OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
    });
  }
});

/**
 * @route   POST /api/bookings/:id/verify-completion-otp
 * @desc    Verify OTP for booking completion
 * @access  Private (nanny only)
 */
router.post('/:id/verify-completion-otp', [
  body('otp').notEmpty().withMessage('OTP is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { otp } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (!booking.completionVerification?.otp) {
      return res.status(400).json({
        success: false,
        message: 'Please request OTP first',
      });
    }

    if (new Date() > booking.completionVerification.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    if (booking.completionVerification.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    // Mark OTP as verified
    booking.completionVerification.otpVerified = true;
    await booking.save();

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        otpVerified: true,
      },
    });
  } catch (error) {
    console.error('Verify Completion OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
    });
  }
});

/**
 * @route   POST /api/bookings/:id/complete
 * @desc    Complete booking with verification image
 * @access  Private (nanny only)
 */
router.post('/:id/complete', [
  body('verificationImage').notEmpty().withMessage('Verification image is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { verificationImage } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('parentId', 'name phoneNumber')
      .populate('nannyId', 'name phoneNumber nannyProfile');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (!['confirmed', 'in-progress'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed or in-progress bookings can be completed',
      });
    }

    if (!booking.completionVerification?.otpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify OTP from parent first',
      });
    }

    // Save verification image and complete booking
    booking.completionVerification.verificationImage = verificationImage;
    booking.completionVerification.verifiedAt = new Date();
    booking.status = 'completed';
    booking.completedAt = new Date();
    booking.payment.status = 'paid';
    booking.payment.paidAt = new Date();

    await booking.save();

    // Update nanny stats and earnings
    if (booking.nannyId) {
      await User.findByIdAndUpdate(booking.nannyId._id, {
        $inc: { 
          'nannyProfile.totalJobsCompleted': 1,
          'nannyProfile.totalEarnings': booking.totalAmount,
          'nannyProfile.availableBalance': booking.totalAmount,
        },
      });

      // Create earning transaction record
      await Transaction.create({
        userId: booking.nannyId._id,
        type: 'earning',
        amount: booking.totalAmount,
        status: 'completed',
        description: `Booking completed with ${booking.parentId?.name || 'Parent'}`,
        bookingId: booking._id,
      });
    }

    console.log(`✅ Booking ${booking.bookingId} completed successfully with verification`);

    res.json({
      success: true,
      message: 'Booking completed successfully',
      data: {
        booking: {
          id: booking._id,
          bookingId: booking.bookingId,
          status: booking.status,
          completedAt: booking.completedAt,
          totalAmount: booking.totalAmount,
        },
      },
    });
  } catch (error) {
    console.error('Complete Booking Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete booking',
    });
  }
});

/**
 * @route   GET /api/bookings/nanny/:nannyId/earnings
 * @desc    Get earnings summary and completed bookings history for a nanny
 * @access  Private (nanny only)
 */
router.get('/nanny/:nannyId/earnings', async (req, res) => {
  try {
    const { nannyId } = req.params;
    const { period = 'all', limit = 50, page = 1 } = req.query;

    // Get nanny profile with earnings data
    const nanny = await User.findById(nannyId);
    if (!nanny || nanny.role !== 'nanny') {
      return res.status(404).json({
        success: false,
        message: 'Nanny not found',
      });
    }

    // Build query for completed bookings
    const query = { 
      nannyId, 
      status: 'completed' 
    };

    // Apply date filter based on period
    const now = new Date();
    if (period === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query.completedAt = { $gte: startOfDay };
    } else if (period === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);
      query.completedAt = { $gte: startOfWeek };
    } else if (period === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      query.completedAt = { $gte: startOfMonth };
    }

    // Get completed bookings (earning history)
    const bookings = await Booking.find(query)
      .populate('parentId', 'name phoneNumber profileImage')
      .sort({ completedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Booking.countDocuments(query);

    // Calculate period earnings
    let periodEarnings = 0;
    bookings.forEach(b => {
      periodEarnings += b.totalAmount || 0;
    });

    // Get today's earnings
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayBookings = await Booking.find({
      nannyId,
      status: 'completed',
      completedAt: { $gte: startOfToday }
    });
    const todayEarnings = todayBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // Get this week's earnings
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const weekBookings = await Booking.find({
      nannyId,
      status: 'completed',
      completedAt: { $gte: startOfWeek }
    });
    const weekEarnings = weekBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // Get this month's earnings
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthBookings = await Booking.find({
      nannyId,
      status: 'completed',
      completedAt: { $gte: startOfMonth }
    });
    const monthEarnings = monthBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalEarnings: nanny.nannyProfile?.totalEarnings || 0,
          availableBalance: nanny.nannyProfile?.availableBalance || 0,
          withdrawnAmount: nanny.nannyProfile?.withdrawnAmount || 0,
          totalJobsCompleted: nanny.nannyProfile?.totalJobsCompleted || 0,
          todayEarnings,
          weekEarnings,
          monthEarnings,
        },
        earningsHistory: bookings.map(booking => ({
          id: booking._id,
          bookingId: booking.bookingId,
          parent: booking.parentId ? {
            id: booking.parentId._id,
            name: booking.parentId.name,
            profileImage: booking.parentId.profileImage,
          } : null,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalHours: booking.totalHours,
          numberOfChildren: booking.numberOfChildren,
          amount: booking.totalAmount,
          completedAt: booking.completedAt,
        })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get Earnings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings',
    });
  }
});

/**
 * @route   POST /api/bookings/:id/generate-qr
 * @desc    Generate a QR token for booking completion scanning
 * @access  Private (parent)
 */
router.post('/:id/generate-qr', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('nannyId', 'name')
      .populate('parentId', 'name');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!['confirmed', 'in-progress'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'QR code is only available for confirmed or in-progress bookings',
      });
    }

    // Generate a unique token for QR
    const crypto = require('crypto');
    const qrToken = crypto.randomBytes(32).toString('hex');
    const qrExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    booking.completionVerification = booking.completionVerification || {};
    booking.completionVerification.qrToken = qrToken;
    booking.completionVerification.qrExpiry = qrExpiry;
    await booking.save();

    res.json({
      success: true,
      data: {
        qrToken,
        qrExpiry,
        bookingId: booking.bookingId,
        nannyName: booking.nannyId?.name || 'Nanny',
      },
    });
  } catch (error) {
    console.error('Generate QR Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
});

/**
 * @route   POST /api/bookings/verify-qr
 * @desc    Verify QR code scan to complete booking (nanny scans parent's QR)
 * @access  Private (nanny)
 */
router.post('/verify-qr', async (req, res) => {
  try {
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({ success: false, message: 'QR token is required' });
    }

    const booking = await Booking.findOne({ 'completionVerification.qrToken': qrToken })
      .populate('parentId', 'name phoneNumber')
      .populate('nannyId', 'name');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Invalid QR code' });
    }

    if (new Date() > booking.completionVerification.qrExpiry) {
      return res.status(400).json({ success: false, message: 'QR code has expired. Please generate a new one.' });
    }

    if (!['confirmed', 'in-progress'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Booking is not in a completable state' });
    }

    // Mark as completed
    booking.status = 'completed';
    booking.completedAt = new Date();
    booking.completionVerification.otpVerified = true;
    booking.completionVerification.verifiedAt = new Date();
    booking.completionVerification.qrToken = null; // Invalidate token
    await booking.save();

    // Update nanny earnings
    const User = require('../models/User');
    await User.findByIdAndUpdate(booking.nannyId._id || booking.nannyId, {
      $inc: {
        'nannyProfile.totalEarnings': booking.totalAmount,
        'nannyProfile.availableBalance': booking.totalAmount,
        'nannyProfile.totalJobsCompleted': 1,
      },
    });

    console.log(`✅ Booking ${booking.bookingId} completed via QR scan`);

    res.json({
      success: true,
      message: 'Booking completed successfully!',
      data: {
        bookingId: booking.bookingId,
        parentName: booking.parentId?.name,
        nannyName: booking.nannyId?.name,
        amount: booking.totalAmount,
        completedAt: booking.completedAt,
      },
    });
  } catch (error) {
    console.error('Verify QR Error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify QR code' });
  }
});

module.exports = router;

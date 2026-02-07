const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');

// ============================================
// ADMIN AUTH
// ============================================

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { phoneNumber, pin } = req.body;

    if (!phoneNumber || !pin) {
      return res.status(400).json({ success: false, message: 'Phone number and PIN required' });
    }

    const admin = await User.findOne({ phoneNumber, role: 'admin' });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin not found' });
    }

    if (admin.privacySettings?.securityPin !== pin) {
      return res.status(401).json({ success: false, message: 'Invalid PIN' });
    }

    res.json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        phoneNumber: admin.phoneNumber,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/admin/create - Create admin (only by existing admin)
router.post('/create', async (req, res) => {
  try {
    const { adminId, phoneNumber, name, email, pin } = req.body;

    // Verify requesting user is admin
    const requestingAdmin = await User.findById(adminId);
    if (!requestingAdmin || requestingAdmin.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Check if user already exists
    let user = await User.findOne({ phoneNumber });
    if (user) {
      if (user.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Admin already exists' });
      }
      // Upgrade existing user to admin
      user.role = 'admin';
      user.name = name || user.name;
      user.email = email || user.email;
      user.privacySettings.securityPin = pin || '1234';
      await user.save();
    } else {
      user = new User({
        phoneNumber,
        name: name || 'Admin',
        email: email || '',
        role: 'admin',
        isVerified: true,
        isProfileComplete: true,
        privacySettings: { securityPin: pin || '1234' },
      });
      await user.save();
    }

    res.json({
      success: true,
      admin: { id: user._id, name: user.name, phoneNumber: user.phoneNumber, email: user.email },
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// DASHBOARD STATISTICS
// ============================================

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // User counts
    const [totalParents, totalNannies, totalAdmins, pendingNannies] = await Promise.all([
      User.countDocuments({ role: 'parent' }),
      User.countDocuments({ role: 'nanny' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'nanny', 'nannyProfile.isVerifiedNanny': false }),
    ]);

    // New users this week/month
    const [newUsersWeek, newUsersMonth, newUsersToday] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: weekStart } }),
      User.countDocuments({ createdAt: { $gte: monthStart } }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    // Booking counts
    const [totalBookings, pendingBookings, confirmedBookings, completedBookings, cancelledBookings, todayBookings] = await Promise.all([
      Booking.countDocuments({}),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    // Revenue
    const revenueResult = await Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    const monthRevenueResult = await Booking.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const monthRevenue = monthRevenueResult[0]?.total || 0;

    const weekRevenueResult = await Booking.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: weekStart } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const weekRevenue = weekRevenueResult[0]?.total || 0;

    // Booking trend (last 30 days)
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const bookingTrend = await Booking.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // User registration trend (last 30 days)
    const userTrend = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            role: '$role',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Top nannies by completed jobs
    const topNannies = await User.find({ role: 'nanny', 'nannyProfile.isVerifiedNanny': true })
      .sort({ 'nannyProfile.totalJobsCompleted': -1 })
      .limit(5)
      .select('name phoneNumber nannyProfile.rating nannyProfile.totalJobsCompleted nannyProfile.totalEarnings profileImage');

    // Recent bookings
    const recentBookings = await Booking.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('parentId', 'name phoneNumber')
      .populate('nannyId', 'name phoneNumber');

    res.json({
      success: true,
      stats: {
        users: {
          totalParents,
          totalNannies,
          totalAdmins,
          pendingNannies,
          newUsersToday,
          newUsersWeek,
          newUsersMonth,
          total: totalParents + totalNannies + totalAdmins,
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
          today: todayBookings,
        },
        revenue: {
          total: totalRevenue,
          month: monthRevenue,
          week: weekRevenue,
        },
        bookingTrend,
        userTrend,
        topNannies,
        recentBookings,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20, verified, sort = '-createdAt' } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (verified === 'true') filter['nannyProfile.isVerifiedNanny'] = true;
    if (verified === 'false') filter['nannyProfile.isVerifiedNanny'] = false;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).select('-privacySettings.securityPin'),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-privacySettings.securityPin');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Get user's bookings count
    const bookingFilter = user.role === 'nanny' ? { nannyId: user._id } : { parentId: user._id };
    const [totalBookings, completedBookings, cancelledBookings] = await Promise.all([
      Booking.countDocuments(bookingFilter),
      Booking.countDocuments({ ...bookingFilter, status: 'completed' }),
      Booking.countDocuments({ ...bookingFilter, status: 'cancelled' }),
    ]);

    // Get user's recent bookings
    const recentBookings = await Booking.find(bookingFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('parentId', 'name phoneNumber')
      .populate('nannyId', 'name phoneNumber');

    res.json({
      success: true,
      user,
      bookingStats: { totalBookings, completedBookings, cancelledBookings },
      recentBookings,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const updates = req.body;
    delete updates._id;
    delete updates.phoneNumber; // Don't allow phone change

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
      .select('-privacySettings.securityPin');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/verify-nanny
router.put('/users/:id/verify-nanny', async (req, res) => {
  try {
    const { approved } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'nanny') {
      return res.status(404).json({ success: false, message: 'Nanny not found' });
    }

    user.nannyProfile.isVerifiedNanny = approved;
    await user.save();

    res.json({ success: true, user, message: approved ? 'Nanny approved' : 'Nanny rejected' });
  } catch (error) {
    console.error('Verify nanny error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete admin' });
    }

    await User.findByIdAndDelete(req.params.id);
    // Also delete related bookings
    await Booking.deleteMany({ $or: [{ parentId: user._id }, { nannyId: user._id }] });

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/toggle-status
router.put('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isDeactivated = !user.isDeactivated;
    await user.save();

    res.json({
      success: true,
      user,
      message: user.isDeactivated ? 'User deactivated' : 'User activated',
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// BOOKING MANAGEMENT
// ============================================

// GET /api/admin/bookings
router.get('/bookings', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20, sort = '-createdAt', dateFrom, dateTo } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { bookingId: { $regex: search, $options: 'i' } },
      ];
    }
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) filter.date.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('parentId', 'name phoneNumber email profileImage')
        .populate('nannyId', 'name phoneNumber email profileImage nannyProfile.rating'),
      Booking.countDocuments(filter),
    ]);

    res.json({
      success: true,
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/bookings/:id
router.get('/bookings/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('parentId', 'name phoneNumber email profileImage addresses')
      .populate('nannyId', 'name phoneNumber email profileImage nannyProfile');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/bookings/:id/status
router.put('/bookings/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    booking.status = status;
    if (status === 'cancelled') {
      booking.cancellation = { cancelledBy: 'admin', reason: reason || 'Cancelled by admin', cancelledAt: new Date() };
    }
    if (status === 'completed') {
      booking.completedAt = new Date();
    }
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// REVIEWS
// ============================================

// GET /api/admin/reviews
router.get('/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('parentId', 'name phoneNumber')
        .populate('nannyId', 'name phoneNumber')
        .populate('bookingId', 'bookingId date'),
      Review.countDocuments({}),
    ]);

    res.json({
      success: true,
      reviews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

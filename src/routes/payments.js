const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const User = require('../models/User');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: 'rzp_test_SCt5S1U8G3ksDV',
  key_secret: 'Ge6iU1m7KkaYIU0amxIo65sp',
});

/**
 * @route   POST /api/payments/create-order
 * @desc    Create a Razorpay order for a booking
 * @access  Private
 */
router.post('/create-order', async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    if (!bookingId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and amount are required',
      });
    }

    // Verify booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Create Razorpay order (amount in paise)
    const options = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `receipt_${booking.bookingId}`,
      notes: {
        bookingId: booking._id.toString(),
        bookingRef: booking.bookingId,
        parentId: booking.parentId.toString(),
        nannyId: booking.nannyId.toString(),
      },
    };

    const order = await razorpay.orders.create(options);

    console.log(`💰 Razorpay order created: ${order.id} for booking ${booking.bookingId}`);

    res.json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId: booking._id,
        bookingRef: booking.bookingId,
        key: 'rzp_test_SCt5S1U8G3ksDV',
      },
    });
  } catch (error) {
    console.error('Create Order Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
    });
  }
});

/**
 * @route   POST /api/payments/verify
 * @desc    Verify Razorpay payment signature and update booking
 * @access  Private
 */
router.post('/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({
        success: false,
        message: 'All payment fields are required',
      });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', 'Ge6iU1m7KkaYIU0amxIo65sp')
      .update(body)
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed - invalid signature',
      });
    }

    // Update booking payment status
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    booking.payment = {
      status: 'paid',
      method: 'online',
      paidAt: new Date(),
      transactionId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
    };
    await booking.save();

    console.log(`✅ Payment verified for booking ${booking.bookingId}: ${razorpay_payment_id}`);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        bookingId: booking._id,
        bookingRef: booking.bookingId,
        paymentId: razorpay_payment_id,
        status: 'paid',
      },
    });
  } catch (error) {
    console.error('Verify Payment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
    });
  }
});

/**
 * @route   PUT /api/payments/booking/:bookingId/pay-later
 * @desc    Mark booking as pay-later (cash on service)
 * @access  Private
 */
router.put('/booking/:bookingId/pay-later', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    booking.payment = {
      status: 'pending',
      method: 'cash',
    };
    await booking.save();

    console.log(`💵 Pay later set for booking ${booking.bookingId}`);

    res.json({
      success: true,
      message: 'Pay later option set successfully',
      data: {
        bookingId: booking._id,
        bookingRef: booking.bookingId,
        paymentMethod: 'cash',
        paymentStatus: 'pending',
      },
    });
  } catch (error) {
    console.error('Pay Later Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set pay later option',
    });
  }
});

/**
 * @route   GET /api/payments/booking/:bookingId/status
 * @desc    Get payment status for a booking
 * @access  Private
 */
router.get('/booking/:bookingId/status', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        bookingRef: booking.bookingId,
        payment: booking.payment,
      },
    });
  } catch (error) {
    console.error('Get Payment Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment status',
    });
  }
});

module.exports = router;

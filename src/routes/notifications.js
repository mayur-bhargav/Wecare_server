const express = require('express');
const { body, validationResult } = require('express-validator');
const NotificationService = require('../services/notificationService');
const User = require('../models/User');

const router = express.Router();

/**
 * @route   POST /api/notifications/send-to-user
 * @desc    Send notification to a specific user (Admin only)
 * @access  Private (Admin)
 */
router.post('/send-to-user', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { userId, title, body: messageBody, data } = req.body;

    const result = await NotificationService.sendToUser(userId, {
      title,
      body: messageBody,
      data: data || {},
    });

    res.json({
      success: result.success,
      message: result.success ? 'Notification sent successfully' : 'Failed to send notification',
      result,
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/notifications/send-to-role
 * @desc    Send notification to all users of a specific role (Admin only)
 * @access  Private (Admin)
 */
router.post('/send-to-role', [
  body('role').isIn(['parent', 'nanny', 'admin']).withMessage('Invalid role'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { role, title, body: messageBody, data } = req.body;

    const result = await NotificationService.sendToRole(role, {
      title,
      body: messageBody,
      data: data || {},
    });

    res.json({
      success: result.success,
      message: result.success 
        ? `Notification sent to ${result.successCount} ${role}s` 
        : 'Failed to send notifications',
      result,
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/notifications/send-to-all
 * @desc    Send notification to all users (Admin only)
 * @access  Private (Admin)
 */
router.post('/send-to-all', [
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { title, body: messageBody, data } = req.body;

    const users = await User.find({
      fcmToken: { $exists: true, $ne: '' },
      'privacySettings.pushNotifications': { $ne: false },
      isDeactivated: { $ne: true }
    });

    const tokens = users.map(u => u.fcmToken).filter(Boolean);

    if (tokens.length === 0) {
      return res.json({
        success: false,
        message: 'No users with valid FCM tokens found',
      });
    }

    const result = await NotificationService.sendToMultipleTokens(tokens, {
      title,
      body: messageBody,
      data: data || {},
    });

    res.json({
      success: result.success,
      message: result.success 
        ? `Notification sent to ${result.successCount} users` 
        : 'Failed to send notifications',
      result,
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/notifications/register-token
 * @desc    Register/Update FCM token for a user
 * @access  Private
 */
router.post('/register-token', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('fcmToken').notEmpty().withMessage('FCM token is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { userId, fcmToken } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.log(`📱 FCM token registered for user ${user.name || user.phoneNumber}`);

    res.json({
      success: true,
      message: 'FCM token registered successfully',
    });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register FCM token',
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/notifications/unregister-token
 * @desc    Remove FCM token for a user (on logout)
 * @access  Private
 */
router.delete('/unregister-token/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken: '' },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.log(`📱 FCM token unregistered for user ${user.name || user.phoneNumber}`);

    res.json({
      success: true,
      message: 'FCM token unregistered successfully',
    });
  } catch (error) {
    console.error('Error unregistering FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unregister FCM token',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/notifications/test/:userId
 * @desc    Send a test notification to a user
 * @access  Private (Admin/Dev)
 */
router.get('/test/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await NotificationService.sendToUser(userId, {
      title: '🔔 Test Notification',
      body: 'This is a test notification from WeCare!',
      data: { type: 'test' },
    });

    res.json({
      success: result.success,
      message: result.success ? 'Test notification sent!' : 'Failed to send',
      result,
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message,
    });
  }
});

module.exports = router;

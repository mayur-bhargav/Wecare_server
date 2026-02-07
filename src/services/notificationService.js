const { admin } = require('../config/firebase');
const User = require('../models/User');

/**
 * Notification Service for sending push notifications via FCM
 */
class NotificationService {
  
  /**
   * Send notification to a single user
   * @param {string} userId - User ID to send notification to
   * @param {object} notification - { title, body, data }
   */
  static async sendToUser(userId, notification) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.fcmToken) {
        console.log(`⚠️ No FCM token for user ${userId}`);
        return { success: false, reason: 'No FCM token' };
      }

      // Check if user has push notifications enabled
      if (user.privacySettings && user.privacySettings.pushNotifications === false) {
        console.log(`⚠️ Push notifications disabled for user ${userId}`);
        return { success: false, reason: 'Notifications disabled' };
      }

      return await this.sendToToken(user.fcmToken, notification);
    } catch (error) {
      console.error('Error sending notification to user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to a specific FCM token
   * @param {string} token - FCM token
   * @param {object} notification - { title, body, data }
   */
  static async sendToToken(token, notification) {
    try {
      if (!admin || !admin.messaging) {
        console.error('❌ Firebase not initialized');
        return { success: false, error: 'Firebase not initialized' };
      }

      const message = {
        token: token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#E23744',
            sound: 'default',
            channelId: 'wecare_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Notification sent successfully:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      // Handle invalid token
      if (error.code === 'messaging/registration-token-not-registered') {
        // Token is invalid, could clean up the database
        console.log('Token is invalid/expired');
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to multiple users
   * @param {array} userIds - Array of user IDs
   * @param {object} notification - { title, body, data }
   */
  static async sendToMultipleUsers(userIds, notification) {
    try {
      const users = await User.find({ 
        _id: { $in: userIds },
        fcmToken: { $exists: true, $ne: '' },
        'privacySettings.pushNotifications': { $ne: false }
      });

      const tokens = users.map(u => u.fcmToken).filter(Boolean);
      
      if (tokens.length === 0) {
        return { success: false, reason: 'No valid tokens' };
      }

      return await this.sendToMultipleTokens(tokens, notification);
    } catch (error) {
      console.error('Error sending to multiple users:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to multiple FCM tokens
   * @param {array} tokens - Array of FCM tokens
   * @param {object} notification - { title, body, data }
   */
  static async sendToMultipleTokens(tokens, notification) {
    try {
      if (!admin || !admin.messaging) {
        console.error('❌ Firebase not initialized');
        return { success: false, error: 'Firebase not initialized' };
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#E23744',
            sound: 'default',
            channelId: 'wecare_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        tokens: tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`✅ Sent ${response.successCount}/${tokens.length} notifications`);
      return { 
        success: true, 
        successCount: response.successCount,
        failureCount: response.failureCount 
      };
    } catch (error) {
      console.error('❌ Error sending multicast notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all users of a specific role
   * @param {string} role - 'parent', 'nanny', or 'admin'
   * @param {object} notification - { title, body, data }
   */
  static async sendToRole(role, notification) {
    try {
      const users = await User.find({ 
        role: role,
        fcmToken: { $exists: true, $ne: '' },
        'privacySettings.pushNotifications': { $ne: false },
        isDeactivated: { $ne: true }
      });

      const tokens = users.map(u => u.fcmToken).filter(Boolean);
      
      if (tokens.length === 0) {
        return { success: false, reason: 'No valid tokens' };
      }

      console.log(`📤 Sending notification to ${tokens.length} ${role}s`);
      return await this.sendToMultipleTokens(tokens, notification);
    } catch (error) {
      console.error('Error sending to role:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send booking created notification to nanny
   */
  static async notifyNewBooking(booking, parent, nanny) {
    const notification = {
      title: '🎉 New Booking Request!',
      body: `${parent.name} wants to book you on ${new Date(booking.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} at ${booking.startTime}`,
      data: {
        type: 'new_booking',
        bookingId: booking._id.toString(),
        screen: 'BookingDetails',
      },
    };

    return await this.sendToUser(nanny._id, notification);
  }

  /**
   * Send booking confirmed notification to parent
   */
  static async notifyBookingConfirmed(booking, parent, nanny) {
    const notification = {
      title: '✅ Booking Confirmed!',
      body: `${nanny.name} has accepted your booking for ${new Date(booking.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`,
      data: {
        type: 'booking_confirmed',
        bookingId: booking._id.toString(),
        screen: 'BookingHistory',
      },
    };

    return await this.sendToUser(parent._id, notification);
  }

  /**
   * Send booking rejected notification to parent
   */
  static async notifyBookingRejected(booking, parent, nanny, reason) {
    const notification = {
      title: '❌ Booking Declined',
      body: `${nanny.name} couldn't accept your booking. ${reason || 'Please try another nanny.'}`,
      data: {
        type: 'booking_rejected',
        bookingId: booking._id.toString(),
        screen: 'Dashboard',
      },
    };

    return await this.sendToUser(parent._id, notification);
  }

  /**
   * Send booking completed notification
   */
  static async notifyBookingCompleted(booking, parent, nanny) {
    // Notify parent
    const parentNotification = {
      title: '🌟 Session Completed!',
      body: `Your session with ${nanny.name} is complete. Please leave a review!`,
      data: {
        type: 'booking_completed',
        bookingId: booking._id.toString(),
        nannyId: nanny._id.toString(),
        screen: 'ReviewScreen',
      },
    };

    await this.sendToUser(parent._id, parentNotification);

    // Notify nanny
    const nannyNotification = {
      title: '💰 Session Completed!',
      body: `Great job! ₹${booking.totalAmount} has been added to your earnings.`,
      data: {
        type: 'earning_added',
        bookingId: booking._id.toString(),
        amount: booking.totalAmount.toString(),
        screen: 'Earnings',
      },
    };

    return await this.sendToUser(nanny._id, nannyNotification);
  }

  /**
   * Send booking cancelled notification
   */
  static async notifyBookingCancelled(booking, cancelledBy, parent, nanny) {
    const notification = {
      title: '🚫 Booking Cancelled',
      body: `The booking for ${new Date(booking.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} has been cancelled.`,
      data: {
        type: 'booking_cancelled',
        bookingId: booking._id.toString(),
        screen: 'BookingHistory',
      },
    };

    // Notify the other party (not the one who cancelled)
    if (cancelledBy === 'parent') {
      return await this.sendToUser(nanny._id, notification);
    } else {
      return await this.sendToUser(parent._id, notification);
    }
  }

  /**
   * Send payment received notification
   */
  static async notifyPaymentReceived(payment, user) {
    const notification = {
      title: '💳 Payment Successful!',
      body: `Your payment of ₹${payment.amount} was successful.`,
      data: {
        type: 'payment_success',
        paymentId: payment._id.toString(),
        screen: 'BookingHistory',
      },
    };

    return await this.sendToUser(user._id, notification);
  }

  /**
   * Send review received notification to nanny
   */
  static async notifyNewReview(review, nanny, parent) {
    const notification = {
      title: '⭐ New Review!',
      body: `${parent.name} gave you ${review.rating} stars. "${review.comment?.substring(0, 50)}..."`,
      data: {
        type: 'new_review',
        reviewId: review._id.toString(),
        screen: 'Reviews',
      },
    };

    return await this.sendToUser(nanny._id, notification);
  }
}

module.exports = NotificationService;

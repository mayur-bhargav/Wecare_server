const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const DaycareProvider = require('../models/DaycareProvider');
const NotificationService = require('../services/notificationService');

const router = express.Router();

// Create or get conversation between parent and daycare
router.post('/conversations', async (req, res) => {
  try {
    const { parentId, daycareId } = req.body;
    if (!parentId || !daycareId) {
      return res.status(400).json({ success: false, message: 'parentId and daycareId required' });
    }

    const parent = await User.findById(parentId);
    const daycare = await DaycareProvider.findById(daycareId);
    if (!parent || !daycare) {
      return res.status(404).json({ success: false, message: 'Parent or daycare not found' });
    }

    let convo = await Conversation.findOne({
      'participants.id': { $all: [String(parentId), String(daycareId)] },
    });

    if (!convo) {
      convo = await Conversation.create({
        participants: [
          { id: String(parentId), type: 'parent', name: parent.name || parent.phoneNumber },
          { id: String(daycareId), type: 'daycare', name: daycare.centerName || 'Daycare Center' },
        ],
        lastMessage: '',
        lastSenderType: '',
        lastMessageAt: new Date(),
      });
    }

    res.json({ success: true, data: { conversation: convo } });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// List conversations for a user
router.get('/conversations', async (req, res) => {
  try {
    const { userId, userType } = req.query;
    if (!userId || !userType) {
      return res.status(400).json({ success: false, message: 'userId and userType required' });
    }

    const conversations = await Conversation.find({
      participants: { $elemMatch: { id: String(userId), type: String(userType) } },
    }).sort({ updatedAt: -1 });

    res.json({ success: true, data: { conversations } });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get messages for a conversation
router.get('/messages/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
    res.json({ success: true, data: { messages } });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send a message
router.post('/messages', async (req, res) => {
  try {
    const { conversationId, senderId, senderType, text } = req.body;
    if (!conversationId || !senderId || !senderType || !text) {
      return res.status(400).json({ success: false, message: 'conversationId, senderId, senderType, text required' });
    }

    const convo = await Conversation.findById(conversationId);
    if (!convo) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const message = await Message.create({
      conversationId,
      senderId: String(senderId),
      senderType,
      text,
    });

    convo.lastMessage = text;
    convo.lastSenderType = senderType;
    convo.lastMessageAt = new Date();
    await convo.save();

    const recipient = convo.participants.find(p => p.id !== String(senderId));
    if (recipient) {
      if (recipient.type === 'parent') {
        await NotificationService.sendToUser(recipient.id, {
          title: 'New message',
          body: text,
          data: { type: 'chat_message', conversationId },
        });
      } else if (recipient.type === 'daycare') {
        const daycare = await DaycareProvider.findById(recipient.id);
        if (daycare?.fcmToken) {
          await NotificationService.sendToToken(daycare.fcmToken, {
            title: 'New enquiry',
            body: text,
            data: { type: 'chat_message', conversationId },
          });
        }
      }
    }

    res.json({ success: true, data: { message } });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

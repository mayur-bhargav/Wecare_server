const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['parent', 'daycare'], required: true },
  name: { type: String, default: '' },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  participants: [participantSchema],
  lastMessage: { type: String, default: '' },
  lastSenderType: { type: String, enum: ['parent', 'daycare', ''] , default: '' },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

conversationSchema.index({ 'participants.id': 1 });
conversationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);

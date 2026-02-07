const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const DaycareProvider = require('../models/DaycareProvider');

const router = express.Router();

// Multer in-memory storage for processing uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

/**
 * Upload a photo from base64
 * POST /api/photos/upload
 */
router.post('/upload', async (req, res) => {
  try {
    const { providerId, image, caption } = req.body;

    if (!providerId || !image) {
      return res.status(400).json({ success: false, message: 'Provider ID and image are required' });
    }

    const provider = await DaycareProvider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(image, {
      folder: `wecare/daycare/${providerId}`,
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    });

    const photo = {
      url: result.secure_url,
      caption: caption || '',
      publicId: result.public_id,
      uploadedAt: new Date(),
    };

    provider.photos.push(photo);
    await provider.save();

    console.log(`📸 Photo uploaded for provider ${providerId}: ${result.secure_url}`);

    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: { photo: provider.photos[provider.photos.length - 1] },
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload photo' });
  }
});

/**
 * Get all photos for a provider
 * GET /api/photos/:providerId
 */
router.get('/:providerId', async (req, res) => {
  try {
    const provider = await DaycareProvider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    res.json({
      success: true,
      data: { photos: provider.photos || [] },
    });
  } catch (error) {
    console.error('Fetch photos error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch photos' });
  }
});

/**
 * Delete a photo
 * DELETE /api/photos/:providerId/:photoIndex
 */
router.delete('/:providerId/:photoIndex', async (req, res) => {
  try {
    const { providerId, photoIndex } = req.params;
    const idx = parseInt(photoIndex);

    const provider = await DaycareProvider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    if (idx < 0 || idx >= (provider.photos || []).length) {
      return res.status(400).json({ success: false, message: 'Invalid photo index' });
    }

    const photo = provider.photos[idx];

    // Delete from Cloudinary if publicId exists
    if (photo.publicId) {
      try {
        await cloudinary.uploader.destroy(photo.publicId);
      } catch (e) {
        console.warn('Cloudinary delete warning:', e.message);
      }
    }

    provider.photos.splice(idx, 1);
    await provider.save();

    console.log(`🗑️ Photo deleted for provider ${providerId} at index ${idx}`);

    res.json({
      success: true,
      message: 'Photo deleted successfully',
      data: { photos: provider.photos },
    });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete photo' });
  }
});

/**
 * Update photo caption
 * PUT /api/photos/:providerId/:photoIndex
 */
router.put('/:providerId/:photoIndex', async (req, res) => {
  try {
    const { providerId, photoIndex } = req.params;
    const { caption } = req.body;
    const idx = parseInt(photoIndex);

    const provider = await DaycareProvider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    if (idx < 0 || idx >= (provider.photos || []).length) {
      return res.status(400).json({ success: false, message: 'Invalid photo index' });
    }

    provider.photos[idx].caption = caption || '';
    await provider.save();

    res.json({
      success: true,
      message: 'Caption updated',
      data: { photo: provider.photos[idx] },
    });
  } catch (error) {
    console.error('Update caption error:', error);
    res.status(500).json({ success: false, message: 'Failed to update caption' });
  }
});

module.exports = router;

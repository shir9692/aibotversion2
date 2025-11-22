const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');

// Create a new ticket
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.requestType) {
      return res.status(400).json({ error: 'requestType is required' });
    }
    const t = new Ticket(payload);
    const saved = await t.save();
    return res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/tickets error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// List tickets (optionally with ?limit=)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const tickets = await Ticket.find().sort({ createdAt: -1 }).limit(limit).exec();
    return res.json(tickets);
  } catch (err) {
    console.error('GET /api/tickets error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to list tickets' });
  }
});

// Get a specific ticket by id (supports Mongo _id or externalId/ticketId/id or guestName)
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Try by Mongo ObjectId first
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      const byId = await Ticket.findById(id).exec();
      if (byId) return res.json(byId);
    }

    // Try matching external ticket id stored in meta.externalId or legacy id fields
    const t = await Ticket.findOne({ $or: [{ 'meta.externalId': id }, { id: id }, { ticketId: id }] }).exec();
    if (t) return res.json(t);

    // Try by guestName as a last resort
    if (id && id.length > 2) {
      const byName = await Ticket.findOne({ guestName: new RegExp(`^${id}$`, 'i') }).exec();
      if (byName) return res.json(byName);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('GET /api/tickets/:id error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

module.exports = router;

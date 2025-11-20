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

// Get a specific ticket by id
router.get('/:id', async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id).exec();
    if (!t) return res.status(404).json({ error: 'Not found' });
    return res.json(t);
  } catch (err) {
    console.error('GET /api/tickets/:id error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

module.exports = router;
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

    // Get a specific ticket by id
    router.get('/:id', async (req, res) => {
      try {
        const t = await Ticket.findById(req.params.id).exec();
        if (!t) return res.status(404).json({ error: 'Not found' });
        return res.json(t);
      } catch (err) {
        console.error('GET /api/tickets/:id error:', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: 'Failed to fetch ticket' });
      }
    });

    module.exports = router;

// Get a specific ticket by id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Try by Mongo ObjectId first (if possible)
    let t = null;
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      t = await Ticket.findById(id).exec();
      if (t) return res.json(t);
    }

    // Try matching external ticket id stored in meta.externalId or legacy `id` field
    t = await Ticket.findOne({ $or: [{ 'meta.externalId': id }, { id: id }, { ticketId: id }] }).exec();
    if (t) return res.json(t);

    // As a last resort, if id looks like something else try to find by regex on guestName
    if (id && id.length > 2) {
      t = await Ticket.findOne({ guestName: new RegExp(`^${id}$`, 'i') }).exec();
      if (t) return res.json(t);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('GET /api/tickets/:id error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

module.exports = router;

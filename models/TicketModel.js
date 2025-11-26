const mongoose = require('mongoose');

const UpdateSchema = new mongoose.Schema({
  author: { type: String, required: false },
  message: { type: String, required: false },
  status: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const TicketSchema = new mongoose.Schema({
  guestName: { type: String, required: false },
  roomNumber: { type: String, required: false },
  requestType: { type: String, required: true },
  priority: { type: String, required: false, default: 'Normal' },
  description: { type: String, required: false },
  status: { type: String, required: true, default: 'open' },
  meta: { type: Object, required: false },
  updates: { type: [UpdateSchema], default: [] },
  resolvedAt: { type: Date, required: false }
}, { timestamps: true });

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);

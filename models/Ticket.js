const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  guestName: { type: String, required: false },
  roomNumber: { type: String, required: false },
  requestType: { type: String, required: true },
  priority: { type: String, required: false, default: 'Normal' },
  description: { type: String, required: false },
  status: { type: String, required: true, default: 'open' },
  meta: { type: Object, required: false }
}, { timestamps: true });

// Model name 'Ticket' -> collection 'tickets'
module.exports = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);

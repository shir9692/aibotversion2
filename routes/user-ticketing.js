module.exports = function(app, deps) {
  const { TicketModel, ticketsContainer, inMemoryTickets, USE_COSMOS_DB } = deps;

  // GET /api/tickets?guestName=&roomNumber=
  app.get('/api/tickets', async (req, res) => {
    try {
      const { guestName, roomNumber } = req.query;
      if (TicketModel) {
        const q = {};
        if (guestName) q.guestName = guestName;
        if (roomNumber) q.roomNumber = roomNumber;
        const tickets = await TicketModel.find(q).sort({ createdAt: -1 }).lean();
        return res.json({ tickets });
      } else if (USE_COSMOS_DB && ticketsContainer) {
        let sql = 'SELECT * FROM c';
        const params = [];
        const filters = [];
        if (guestName) { filters.push('c.guestName = @guestName'); params.push({ name: '@guestName', value: guestName }); }
        if (roomNumber) { filters.push('c.roomNumber = @roomNumber'); params.push({ name: '@roomNumber', value: roomNumber }); }
        if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
        sql += ' ORDER BY c.createdAt DESC';
        const { resources } = await ticketsContainer.items.query({ query: sql, parameters: params }).fetchAll();
        return res.json({ tickets: resources });
      } else {
        const tickets = inMemoryTickets.filter(t => {
          if (guestName && t.guestName !== guestName) return false;
          if (roomNumber && t.roomNumber !== roomNumber) return false;
          return true;
        });
        return res.json({ tickets });
      }
    } catch (err) {
      res.status(500).json({ error: err && err.message ? err.message : err });
    }
  });

  // GET /api/tickets/:id
  app.get('/api/tickets/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (TicketModel) {
        let ticket = await TicketModel.findOne({ $or: [ { 'meta.externalId': id }, { id: id } ] }).lean();
        if (!ticket) {
          try { ticket = await TicketModel.findById(id).lean(); } catch(e){}
        }
        if (!ticket) return res.status(404).json({ error: 'Not found' });
        return res.json({ ticket });
      } else if (USE_COSMOS_DB && ticketsContainer) {
        const { resource } = await ticketsContainer.item(id, undefined).read();
        if (!resource) return res.status(404).json({ error: 'Not found' });
        return res.json({ ticket: resource });
      } else {
        const ticket = inMemoryTickets.find(t => t.id === id || t._id === id);
        if (!ticket) return res.status(404).json({ error: 'Not found' });
        return res.json({ ticket });
      }
    } catch (err) {
      res.status(500).json({ error: err && err.message ? err.message : err });
    }
  });

  // POST /api/tickets/:id/updates
  app.post('/api/tickets/:id/updates', async (req, res) => {
    try {
      const id = req.params.id;
      const { author, message, status } = req.body;
      const update = { author, message, status, createdAt: new Date().toISOString() };

      if (TicketModel) {
        const updateObj = { $push: { updates: update } };
        if (status) updateObj.$set = { status };
        const updated = await TicketModel.findOneAndUpdate(
          { $or: [ { 'meta.externalId': id }, { id: id } ] },
          updateObj,
          { new: true }
        ).lean();
        if (!updated) {
          try {
            const byId = await TicketModel.findById(id).lean();
            if (!byId) return res.status(404).json({ error: 'Not found' });
          } catch (e) { return res.status(404).json({ error: 'Not found' }); }
        }
        return res.json({ ticket: updated });
      } else if (USE_COSMOS_DB && ticketsContainer) {
        const { resource } = await ticketsContainer.item(id, undefined).read();
        if (!resource) return res.status(404).json({ error: 'Not found' });
        resource.updates = resource.updates || [];
        resource.updates.push(update);
        if (status) resource.status = status;
        if (status && status.toLowerCase() === 'resolved') resource.resolvedAt = new Date().toISOString();
        const { resource: replaced } = await ticketsContainer.item(id, undefined).replace(resource);
        return res.json({ ticket: replaced });
      } else {
        const ticket = inMemoryTickets.find(t => t.id === id || t._id === id);
        if (!ticket) return res.status(404).json({ error: 'Not found' });
        ticket.updates = ticket.updates || [];
        ticket.updates.push(update);
        if (status) ticket.status = status;
        if (status && status.toLowerCase() === 'resolved') ticket.resolvedAt = new Date().toISOString();
        return res.json({ ticket: ticket });
      }
    } catch (err) {
      res.status(500).json({ error: err && err.message ? err.message : err });
    }
  });
};

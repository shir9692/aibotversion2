const fetch = require('node-fetch');

async function postTicket(ticket) {
  try {
    const res = await fetch('http://localhost:3000/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket)
    });
    const text = await res.text();
    console.log('POST status:', res.status);
    console.log('POST body:', text);
  } catch (err) {
    console.error('POST failed:', err.message || err);
  }
}

(async () => {
  // Wait a moment for server to be ready
  await new Promise(r => setTimeout(r, 3000));

  await postTicket({ guestName: 'Test Guest A', roomNumber: '301', requestType: 'Housekeeping', priority: 'Medium', description: 'Need extra towels' });
  await postTicket({ guestName: 'Test Guest B', roomNumber: '302', requestType: 'Maintenance', priority: 'High', description: 'AC not cooling' });

  try {
    const res = await fetch('http://localhost:3000/api/tickets');
    const list = await res.text();
    console.log('\nGET /api/tickets status:', res.status);
    console.log('GET /api/tickets body:\n', list);
  } catch (err) {
    console.error('GET failed:', err.message || err);
  }
})();

// Test buttons manually - paste this in browser console (F12)
const testButtons = document.createElement('div');
testButtons.className = 'quick-options';
['🍴 Food & Dining', '🎨 Arts & Culture', '🏞️ Outdoor Activities'].forEach(opt => {
  const btn = document.createElement('button');
  btn.className = 'option-btn';
  btn.textContent = opt;
  btn.onclick = () => { document.getElementById('message').value = opt; document.getElementById('send').click(); };
  testButtons.appendChild(btn);
});
document.getElementById('history').appendChild(testButtons);

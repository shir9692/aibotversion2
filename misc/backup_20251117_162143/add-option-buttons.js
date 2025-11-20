// add-option-buttons.js
// Add this code to index.html to enable clickable option buttons

// Define onboarding options
const ONBOARDING_OPTIONS = {
  interests: [
    '🍴 Food & Dining',
    '🎨 Arts & Culture',
    '🏞️ Outdoor Activities',
    '🛍️ Shopping',
    '🌙 Nightlife',
    '👨‍👩‍👧 Family Fun'
  ],
  dietary: [
    'Vegetarian',
    'Vegan',
    'Halal',
    'Kosher',
    'Gluten-free',
    'No restrictions'
  ]
};

// Function to detect if bot message contains onboarding questions
function detectOnboarding(message) {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('interested in') && lowerMsg.includes('stay')) {
    return 'interests';
  }
  if (lowerMsg.includes('dietary') && lowerMsg.includes('preferences')) {
    return 'dietary';
  }
  return null;
}

// Function to create and append option buttons
function appendOptionButtons(options, parentElement) {
  const container = document.createElement('div');
  container.className = 'quick-options';
  
  options.forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = option;
    btn.onclick = () => {
      // Auto-fill input and send
      inputEl.value = option.replace(/^[🍴🎨🏞️🛍️🌙👨‍👩‍👧]\s*/, ''); // Remove emoji
      sendBtn.click();
    };
    container.appendChild(btn);
  });
  
  parentElement.appendChild(container);
  historyEl.scrollTop = historyEl.scrollHeight;
}

// INTEGRATION INSTRUCTIONS:
// 1. Add the ONBOARDING_OPTIONS and functions above into the <script> section of index.html
// 2. Modify the append() function to detect onboarding and add buttons
// 3. After appending bot message, check if onboarding detected and add buttons

/* 
REPLACE this in index.html:

    function append(text, who='bot') {
      const d = document.createElement('div');
      d.className = 'msg ' + (who === 'user' ? 'user' : 'bot');
      d.innerText = (who === 'user' ? 'You: ' : 'Bot: ') + text;
      historyEl.appendChild(d);
      historyEl.scrollTop = historyEl.scrollHeight;
      return d;
    }

WITH:

    function append(text, who='bot') {
      const d = document.createElement('div');
      d.className = 'msg ' + (who === 'user' ? 'user' : 'bot');
      d.innerText = (who === 'user' ? 'You: ' : 'Bot: ') + text;
      historyEl.appendChild(d);
      historyEl.scrollTop = historyEl.scrollHeight;
      
      // Check for onboarding and add option buttons
      if (who === 'bot') {
        const onboardingType = detectOnboarding(text);
        if (onboardingType && ONBOARDING_OPTIONS[onboardingType]) {
          appendOptionButtons(ONBOARDING_OPTIONS[onboardingType], historyEl);
        }
      }
      
      return d;
    }
*/

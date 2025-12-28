# 🗓️ Mini Itinerary Feature - Implementation Plan

## 📋 Overview

Create a personalized mini itinerary feature that allows the AI concierge to build custom day plans for guests based on their interests, preferences, and available time.

**Goal**: Enhance guest experience by providing curated, personalized daily itineraries that maximize their stay enjoyment.

---

## 🎯 Feature Requirements

### Core Functionality:
1. **Generate Itineraries**: AI creates personalized day plans based on:
   - Guest preferences (from profile)
   - Time available (half-day, full-day, evening)
   - Interests (dining, culture, shopping, etc.)
   - Weather conditions
   - Local events

2. **Save Itineraries**: Store itineraries for each guest session

3. **Display Itineraries**: Show formatted itinerary in chat and dedicated view

4. **Track Usage**: Analytics on itinerary requests and completion

---

## 🏗️ Implementation Steps

### **Step 1: Add Itinerary Tool to Agent**
**File**: `server-with-azure-ai.js`  
**Location**: Add to `agentTools` array (around line 980)

**Tool Definition**:
```javascript
{
  type: 'function',
  function: {
    name: 'createItinerary',
    description: 'Create a personalized mini itinerary for the guest based on their preferences, time available, and interests. Use when guest asks "what should I do today", "plan my day", "things to do", or similar requests.',
    parameters: {
      type: 'object',
      properties: {
        duration: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'half-day', 'full-day'],
          description: 'How much time the guest has available'
        },
        interests: {
          type: 'array',
          items: { type: 'string' },
          description: 'Guest interests: food, culture, shopping, nature, nightlife, family, relaxation, adventure'
        },
        date: {
          type: 'string',
          description: 'Date for the itinerary (e.g., "today", "tomorrow", "2025-12-10")'
        },
        budget: {
          type: 'string',
          enum: ['budget', 'moderate', 'luxury'],
          description: 'Budget level for activities (optional)'
        },
        includeTransport: {
          type: 'boolean',
          description: 'Whether to include transportation details'
        }
      },
      required: ['duration']
    }
  }
}
```

---

### **Step 2: Create Itinerary Data Structure**
**File**: `server-with-azure-ai.js`  
**Location**: Add after analytics object (around line 150)

```javascript
// ITINERARY STORAGE
const guestItineraries = new Map(); // sessionId -> [itineraries]

// Itinerary structure:
// {
//   id: 'ITIN-timestamp-random',
//   sessionId: 'session123',
//   date: '2025-12-09',
//   duration: 'full-day',
//   activities: [
//     {
//       time: '9:00 AM',
//       activity: 'Breakfast at Rooftop Cafe',
//       location: 'Hotel Rooftop',
//       duration: '1 hour',
//       category: 'dining',
//       notes: 'Try the avocado toast!',
//       cost: '$25'
//     },
//     // ... more activities
//   ],
//   createdAt: timestamp,
//   preferences: { interests: [], budget: 'moderate' }
// }
```

---

### **Step 3: Implement Itinerary Generator Function**
**File**: `server-with-azure-ai.js`  
**Location**: Add before `executeToolCall` function (around line 1560)

```javascript
// Generate personalized itinerary based on guest preferences
async function generateItinerary(duration, interests = [], guestProfile = null, date = 'today', budget = 'moderate', includeTransport = true) {
  const itineraryId = `ITIN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Use guest profile interests if not provided
  const finalInterests = interests.length > 0 ? interests : (guestProfile?.interests || ['general']);
  
  // Get current weather for recommendations
  let weatherContext = '';
  try {
    const weather = await fetchWeatherData('current');
    if (weather.success) {
      weatherContext = `Weather: ${weather.current.temp}°F, ${weather.current.condition}. `;
    }
  } catch (err) {
    console.log('Weather fetch failed for itinerary');
  }
  
  // Define time slots based on duration
  const timeSlots = {
    'morning': ['9:00 AM', '11:00 AM'],
    'afternoon': ['1:00 PM', '3:00 PM', '5:00 PM'],
    'evening': ['6:00 PM', '8:00 PM'],
    'half-day': ['9:00 AM', '11:00 AM', '1:00 PM'],
    'full-day': ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '6:00 PM', '8:00 PM']
  };
  
  const slots = timeSlots[duration] || timeSlots['half-day'];
  
  // Activity templates based on interests and time
  const activityTemplates = {
    'Food & Dining': {
      morning: { activity: 'Breakfast at local cafe', duration: '1 hour', category: 'dining' },
      afternoon: { activity: 'Lunch at recommended restaurant', duration: '1.5 hours', category: 'dining' },
      evening: { activity: 'Dinner at rooftop restaurant', duration: '2 hours', category: 'dining' }
    },
    'Arts & Culture': {
      morning: { activity: 'Visit local museum', duration: '2 hours', category: 'culture' },
      afternoon: { activity: 'Art gallery tour', duration: '1.5 hours', category: 'culture' },
      evening: { activity: 'Theater performance', duration: '2.5 hours', category: 'culture' }
    },
    'Outdoor Activities': {
      morning: { activity: 'Morning hike at nearby park', duration: '2 hours', category: 'nature' },
      afternoon: { activity: 'Botanical garden visit', duration: '1.5 hours', category: 'nature' },
      evening: { activity: 'Sunset viewpoint', duration: '1 hour', category: 'nature' }
    },
    'Shopping': {
      morning: { activity: 'Local farmers market', duration: '1.5 hours', category: 'shopping' },
      afternoon: { activity: 'Shopping district tour', duration: '2 hours', category: 'shopping' },
      evening: { activity: 'Night market exploration', duration: '2 hours', category: 'shopping' }
    },
    'Nightlife': {
      evening: { activity: 'Cocktail bar experience', duration: '2 hours', category: 'nightlife' }
    },
    'Family Fun': {
      morning: { activity: 'Family-friendly attraction', duration: '2 hours', category: 'family' },
      afternoon: { activity: 'Interactive museum', duration: '2 hours', category: 'family' }
    }
  };
  
  // Build activities array
  const activities = [];
  let currentTime = slots[0];
  
  for (let i = 0; i < slots.length; i++) {
    const timeOfDay = slots[i].includes('AM') ? 'morning' : (parseInt(slots[i]) < 6 ? 'afternoon' : 'evening');
    
    // Select activity based on interests
    let selectedActivity = null;
    for (const interest of finalInterests) {
      if (activityTemplates[interest] && activityTemplates[interest][timeOfDay]) {
        selectedActivity = { ...activityTemplates[interest][timeOfDay] };
        break;
      }
    }
    
    // Fallback to general activities
    if (!selectedActivity) {
      const generalActivities = {
        morning: { activity: 'Explore local neighborhood', duration: '1.5 hours', category: 'general' },
        afternoon: { activity: 'Visit popular attraction', duration: '2 hours', category: 'general' },
        evening: { activity: 'Dinner and evening stroll', duration: '2 hours', category: 'general' }
      };
      selectedActivity = generalActivities[timeOfDay];
    }
    
    // Add cost based on budget
    const costs = {
      budget: { dining: '$15', culture: '$10', shopping: '$20', general: '$15' },
      moderate: { dining: '$35', culture: '$25', shopping: '$50', general: '$30' },
      luxury: { dining: '$75', culture: '$50', shopping: '$150', general: '$60' }
    };
    
    activities.push({
      time: slots[i],
      activity: selectedActivity.activity,
      location: 'See recommendations',
      duration: selectedActivity.duration,
      category: selectedActivity.category,
      notes: weatherContext || 'Enjoy your experience!',
      cost: costs[budget][selectedActivity.category] || costs[budget]['general']
    });
    
    // Add transport between activities if requested
    if (includeTransport && i < slots.length - 1) {
      activities.push({
        time: 'Travel time',
        activity: '🚗 Transportation',
        location: 'Between locations',
        duration: '15-20 min',
        category: 'transport',
        notes: 'Taxi, rideshare, or public transit',
        cost: '$10-15'
      });
    }
  }
  
  return {
    id: itineraryId,
    date: date,
    duration: duration,
    activities: activities,
    preferences: {
      interests: finalInterests,
      budget: budget
    },
    createdAt: new Date().toISOString()
  };
}
```

---

### **Step 4: Add Tool Handler**
**File**: `server-with-azure-ai.js`  
**Location**: In `executeToolCall` function, before default case (around line 1965)

```javascript
case 'createItinerary': {
  const { duration, interests, date, budget, includeTransport } = args;
  
  try {
    // Get guest profile for personalization
    const sessionId = global.currentSessionId || 'unknown';
    const guestProfile = await getGuestProfile(sessionId);
    
    // Generate itinerary
    const itinerary = await generateItinerary(
      duration,
      interests || [],
      guestProfile,
      date || 'today',
      budget || 'moderate',
      includeTransport !== false
    );
    
    // Store itinerary
    if (!guestItineraries.has(sessionId)) {
      guestItineraries.set(sessionId, []);
    }
    guestItineraries.get(sessionId).push(itinerary);
    
    // Track itinerary creation
    trackItinerary(sessionId, itinerary.id, duration, interests || []);
    
    console.log(`📅 Itinerary created: ${itinerary.id} for ${duration}`);
    
    // Format response
    let response = `📅 **Your ${duration} itinerary for ${date || 'today'}**\n\n`;
    itinerary.activities.forEach((act, idx) => {
      if (act.category !== 'transport') {
        response += `**${act.time}** - ${act.activity}\n`;
        response += `   📍 ${act.location} | ⏱️ ${act.duration} | 💰 ${act.cost}\n`;
        if (act.notes) response += `   💡 ${act.notes}\n`;
        response += '\n';
      }
    });
    
    return {
      success: true,
      itinerary: itinerary,
      itineraryId: itinerary.id,
      message: response
    };
    
  } catch (error) {
    console.error('Error creating itinerary:', error);
    return {
      success: false,
      error: 'Failed to create itinerary. Please try again.'
    };
  }
}
```

---

### **Step 5: Add Tracking Function**
**File**: `server-with-azure-ai.js`  
**Location**: After other tracking functions (around line 400)

```javascript
// Track itinerary creation and usage
function trackItinerary(sessionId, itineraryId, duration, interests) {
  if (!analytics.itineraries) {
    analytics.itineraries = [];
  }
  
  analytics.itineraries.push({
    sessionId,
    itineraryId,
    duration,
    interests,
    timestamp: new Date().toISOString()
  });
  
  console.log(`📊 Itinerary tracked: ${itineraryId} (${duration})`);
}
```

---

### **Step 6: Update System Prompt**
**File**: `server-with-azure-ai.js`  
**Location**: In system prompt (around line 2020)

Add this section:
```javascript
📅 ITINERARY CREATION:
  When guests ask "what should I do today", "plan my day", "things to do", or similar:
  - Call createItinerary tool with appropriate duration
  - Use guest profile interests for personalization
  - Consider weather and local events
  - Provide specific, actionable recommendations
  - Include timing, locations, and estimated costs
```

---

### **Step 7: Add Analytics Endpoint**
**File**: `server-with-azure-ai.js`  
**Location**: In analytics endpoint (around line 2520)

Add to response payload:
```javascript
// Itinerary metrics
itineraryMetrics: {
  totalCreated: analytics.itineraries?.length || 0,
  byDuration: analytics.itineraries?.reduce((acc, i) => {
    acc[i.duration] = (acc[i.duration] || 0) + 1;
    return acc;
  }, {}) || {},
  popularInterests: analytics.itineraries?.flatMap(i => i.interests)
    .reduce((acc, interest) => {
      acc[interest] = (acc[interest] || 0) + 1;
      return acc;
    }, {}) || {}
}
```

---

## 🎨 Frontend Enhancement (Optional)

### **Step 8: Create Itinerary Display Component**
**File**: `index.html` or new `itinerary.html`

```html
<div id="itinerary-view" class="itinerary-container">
  <h2>📅 Your Personalized Itinerary</h2>
  <div id="itinerary-timeline">
    <!-- Activities will be displayed here -->
  </div>
  <button onclick="downloadItinerary()">📥 Download PDF</button>
  <button onclick="shareItinerary()">📤 Share</button>
</div>
```

---

## 🧪 Testing Plan

### Test Queries:
1. **Basic**: "What should I do today?"
2. **Specific**: "Plan a full day for me with food and culture"
3. **Time-based**: "What can I do this evening?"
4. **Budget**: "Give me a budget-friendly half-day plan"

### Expected Behavior:
- AI calls `createItinerary` tool
- Returns formatted itinerary with times, activities, costs
- Stores itinerary in session
- Tracks in analytics

---

## 📊 Success Metrics

Track in analytics dashboard:
- **Total itineraries created**
- **Most popular duration** (full-day, half-day, etc.)
- **Top interests** requested
- **Average activities per itinerary**
- **Guest satisfaction** with itineraries

---

## 🚀 Implementation Timeline

| Step | Task | Time | Priority |
|------|------|------|----------|
| 1 | Add itinerary tool definition | 10 min | HIGH |
| 2 | Create data structure | 5 min | HIGH |
| 3 | Implement generator function | 30 min | HIGH |
| 4 | Add tool handler | 15 min | HIGH |
| 5 | Add tracking | 10 min | MEDIUM |
| 6 | Update system prompt | 5 min | HIGH |
| 7 | Add analytics | 10 min | MEDIUM |
| 8 | Frontend display (optional) | 30 min | LOW |

**Total Time**: 1-2 hours (core features)

---

## 💡 Future Enhancements

1. **Real-time Integration**: Pull actual events, restaurant availability
2. **Weather-aware**: Adjust activities based on forecast
3. **Booking Integration**: Direct booking from itinerary
4. **Collaborative**: Share itineraries with travel companions
5. **AI Learning**: Improve suggestions based on feedback
6. **Multi-day**: Extend to multi-day trip planning

---

## 📝 Summary

This implementation will:
- ✅ Create personalized itineraries based on guest preferences
- ✅ Track itinerary usage in analytics
- ✅ Enhance guest experience with curated recommendations
- ✅ Integrate seamlessly with existing AI agent
- ✅ Provide actionable, time-based activity plans

**Ready to implement?** Start with Steps 1-4 for core functionality!

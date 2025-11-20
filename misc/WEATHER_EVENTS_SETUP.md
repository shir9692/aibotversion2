# Weather & Events Integration Guide

## Overview
Your AI Concierge now includes **real-time weather** and **local events** features to keep guests informed!

## Features Added

### 🌤️ Weather Integration
- **Current conditions**: Temperature, feels-like, humidity, wind
- **Weather advice**: Automatic tips based on conditions (bring umbrella, dress warm, etc.)
- **Location-aware**: Works with city names or guest's GPS location

**Guest queries:**
- "What's the weather like?"
- "Is it going to rain today?"
- "Should I bring a jacket?"
- "Weather forecast"

### 🎉 Local Events Search
- **Event types**: Concerts, sports, arts, festivals, nightlife, family events
- **Timeframes**: Today, tonight, tomorrow, this weekend, this week
- **Smart recommendations**: Based on guest interests from profile

**Guest queries:**
- "What's happening tonight?"
- "Any concerts this weekend?"
- "Events near me"
- "Things to do today"

---

## Setup Instructions

### 1. Weather API (OpenWeatherMap)

#### Get Free API Key:
1. Go to https://openweathermap.org/api
2. Click **"Sign Up"** (free tier: 1000 calls/day)
3. Verify email and get your API key
4. Add to `.env` file:

```env
OPENWEATHER_API_KEY=your_actual_api_key_here
```

**Without API key**: System returns mock weather data with setup instructions

---

### 2. Events API (Eventbrite)

#### Get Free API Key:
1. Go to https://www.eventbrite.com/platform/api
2. Sign in or create account
3. Navigate to **Account Settings > API Keys**
4. Create a new private token
5. Add to `.env` file:

```env
EVENTBRITE_API_KEY=your_actual_api_key_here
```

**Without API key**: System returns curated mock events with setup instructions

---

## Testing the Features

### Test Weather:
```
Guest: "What's the weather like?"
Bot: [Uses getCurrentWeather tool and provides current conditions + advice]
```

### Test Events:
```
Guest: "What's happening tonight?"
Bot: [Uses searchLocalEvents tool and lists upcoming events]
```

### Combined with Location Sharing:
```
1. Guest checks "Share my location"
2. Guest: "Weather near me"
3. Bot: [Uses GPS coordinates for hyper-local weather]
```

---

## How It Works

### Weather Tool
```javascript
getCurrentWeather(location)
├─ If "current" → use browser GPS coordinates
├─ Else → geocode city name to lat/lon
├─ Call OpenWeatherMap API
├─ Generate weather advice (hot/cold/rain/wind)
└─ Return formatted weather data
```

### Events Tool
```javascript
searchLocalEvents(location, eventType, timeframe)
├─ Geocode city to coordinates
├─ Calculate date range (today/tonight/weekend)
├─ Call Eventbrite API with location radius
├─ Filter by event type if specified
└─ Return top 10 events with details
```

---

## Integration with Existing Features

### ✅ Works with Guest Profiles
- Events filtered by guest interests (arts → art events, nightlife → concerts)
- Weather advice considers mobility needs

### ✅ Works with Location Sharing
- "Weather near me" uses GPS coordinates
- "Events around here" searches nearby

### ✅ Works with Analytics
- Tracks weather queries
- Tracks event searches
- Shows popular timeframes

---

## Cost Estimates

### OpenWeatherMap (Free Tier)
- **Limit**: 1,000 calls/day
- **Typical usage**: ~100-200 calls/day (guests check weather 1-2x)
- **Cost**: $0/month
- **Upgrade**: $40/month for 100k calls if needed

### Eventbrite (Free Tier)
- **Limit**: Rate-limited but generous
- **Typical usage**: ~50-100 calls/day
- **Cost**: $0/month
- **Upgrade**: Contact Eventbrite for enterprise

---

## Alternative APIs (If Needed)

### Weather Alternatives:
- **Weather.gov** (US only, free, no key needed)
- **Visual Crossing** (1000 free calls/day)
- **Weatherstack** (1000 free calls/month)

### Events Alternatives:
- **Ticketmaster Discovery API** (5000 calls/day free)
- **SeatGeek** (Rate-limited, free tier)
- **Predicthq** (Events intelligence platform)
- **Local tourism board APIs** (often free)

---

## Future Enhancements

### Phase 2 Ideas:
- [ ] **Weather alerts**: Push notifications for severe weather
- [ ] **Event bookings**: Direct ticket purchase integration
- [ ] **Calendar export**: Add events to Google/Outlook calendar
- [ ] **Price tracking**: Monitor event ticket prices
- [ ] **Personalized feed**: Daily digest of weather + events
- [ ] **Multi-day forecast**: 7-day weather outlook
- [ ] **Traffic integration**: Event attendance impact on transit

---

## Troubleshooting

### Weather Not Working?
1. Check `.env` has valid `OPENWEATHER_API_KEY`
2. Verify API key is active at OpenWeatherMap dashboard
3. Check server logs for API error messages
4. Test API key directly: `curl "https://api.openweathermap.org/data/2.5/weather?q=Seattle&appid=YOUR_KEY"`

### Events Not Working?
1. Check `.env` has valid `EVENTBRITE_API_KEY`
2. Verify token has read permissions
3. Check rate limits in Eventbrite dashboard
4. Ensure location geocoding is working (weather must work first)

### Mock Data Showing?
- This is normal if API keys not configured
- Guests see helpful message with setup instructions
- Mock data is realistic and useful for testing

---

## Production Deployment

### Before Going Live:
1. ✅ Get real API keys (not "demo")
2. ✅ Test with multiple cities
3. ✅ Monitor API usage in dashboards
4. ✅ Set up error alerts
5. ✅ Consider paid tiers based on guest volume

### Monitoring:
- Track API call counts in analytics dashboard
- Set up alerts for rate limit warnings
- Monitor response times (should be <2s)
- Log failed API calls for debugging

---

## Support

**Weather API Issues**: https://openweathermap.org/faq
**Eventbrite API Issues**: https://www.eventbrite.com/platform/docs/support

**Questions?** Check server logs for detailed error messages.

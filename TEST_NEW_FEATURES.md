# Quick Test Guide: Weather & Events Features

## ✅ Features Deployed

Your concierge bot now has 2 new capabilities:
1. **Weather Information** 🌤️
2. **Local Events Search** 🎉

---

## 🧪 Test Scenarios

### Test 1: Weather Query (Mock Mode)
**Note**: Currently using mock data (no API key configured yet)

```
Guest: "What's the weather like?"
Expected: Bot returns mock weather data + message about configuring API key
```

```
Guest: "Is it going to rain?"
Expected: Bot checks weather and provides advice
```

### Test 2: Events Query (Mock Mode)
```
Guest: "What's happening tonight?"
Expected: Bot returns 4 mock events (jazz, farmers market, gallery, food festival)
```

```
Guest: "Any concerts this weekend?"
Expected: Bot filters events to show concerts/music events
```

### Test 3: Combined with Location Sharing
```
1. Check "Share my location" checkbox
2. Guest: "Weather near me"
3. Expected: Bot uses GPS coordinates for local weather
```

### Test 4: Natural Language Variations
```
- "Will I need an umbrella today?"
- "What's the temperature?"
- "Things to do this weekend"
- "Events around here"
- "What's happening in Seattle tonight?"
```

---

## 🎯 What to Look For

### ✅ Success Indicators:
- Bot recognizes weather/event queries
- Returns structured information (temp, conditions, event details)
- Provides helpful advice (bring jacket, rain expected, etc.)
- Shows mock data disclaimer when APIs not configured
- Analytics panel tracks weather/event searches

### ❌ Issues to Report:
- Bot doesn't understand weather queries
- Error messages instead of mock data
- Server crashes or timeout errors
- Analytics not tracking new query types

---

## 🔧 Activate Real Data (Optional)

### For Real Weather:
1. Get free API key: https://openweathermap.org/api
2. Add to `.env`: `OPENWEATHER_API_KEY=your_key_here`
3. Restart server
4. Test: "What's the weather in Paris?"

### For Real Events:
1. Get free API key: https://www.eventbrite.com/platform/api
2. Add to `.env`: `EVENTBRITE_API_KEY=your_key_here`
3. Restart server
4. Test: "Events in New York this weekend"

---

## 📊 Analytics Integration

New metrics tracked:
- Weather query count
- Event search count
- Most searched cities
- Popular timeframes (today/tonight/weekend)

Check analytics panel to see these in action!

---

## 🐛 Troubleshooting

**Bot doesn't respond to "weather"?**
- Try: "What's the weather like?"
- Or: "Is it going to rain?"

**Bot doesn't show events?**
- Try: "What's happening tonight?"
- Or: "Events this weekend"

**Want to see server logs?**
- Check terminal for tool execution logs
- Look for: "🛠️ Executing tool: getCurrentWeather"
- Look for: "🛠️ Executing tool: searchLocalEvents"

---

## 🎉 Demo Script

**Perfect demo conversation:**

```
Guest: Hi!
Bot: [Onboarding questions]

Guest: I'm interested in food and nightlife
Bot: [Saves preferences]

Guest: What's the weather like today?
Bot: [Returns weather with advice]

Guest: What's happening tonight?
Bot: [Returns events, filtered by guest interests - nightlife/food events prioritized]

Guest: Show me restaurants nearby
Bot: [Returns restaurant suggestions]

Guest: Can I get extra towels?
Bot: [Creates housekeeping ticket]
```

This showcases: onboarding → weather → events → search → ticketing → analytics tracking all interactions!

---

## 📝 Next Steps

After testing basic functionality:
1. ✅ Verify mock data appears correctly
2. ✅ Test with different cities/locations
3. ✅ Add real API keys for production data
4. ✅ Monitor analytics for usage patterns
5. ✅ Consider upgrading APIs if high volume

---

**Ready to test!** Open http://localhost:3000 and try the queries above.

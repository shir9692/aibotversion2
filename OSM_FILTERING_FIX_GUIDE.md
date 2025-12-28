# 🔧 OSM API Cuisine & Amenity Filtering - Fix Guide

## 🎯 Problem
The current OSM (OpenStreetMap) API implementation doesn't support filtering by:
- **Specific cuisines** (Italian, Chinese, Mexican, Thai, etc.)
- **Specific amenities** (gym, spa, parking, etc.)
- **Shop types** (bookstore, electronics, clothing, etc.)

Currently, it only has hardcoded categories (food, shopping, attractions).

---

## ✅ Solution Overview

We need to enhance the `findPlacesAroundCoords()` function to accept filter parameters and build dynamic Overpass QL queries.

---

## 📝 Implementation Steps

### **Step 1: Update Function Signature**

**File**: `server-with-azure-ai.js`  
**Location**: Line ~1127

**Current**:
```javascript
async function findPlacesAroundCoords(lat, lon, radius = 1200, category = 'tourist attraction')
```

**New**:
```javascript
async function findPlacesAroundCoords(lat, lon, radius = 1200, category = 'tourist attraction', filters = {})
```

---

### **Step 2: Add Cuisine Filtering Logic**

Add after line 1128:

```javascript
// Extract filters
const { cuisine, amenity, specificType } = filters;

// FOOD/RESTAURANT QUERIES with cuisine filtering
if (/(food|restaurant|cafe|eat|dining|bar|pub)/i.test(cat)) {
  if (cuisine) {
    // Filter by specific cuisine
    const cuisineValue = cuisine.toLowerCase();
    console.log(`🍽️ Searching for ${cuisineValue} cuisine restaurants`);
    blocks = `
      node(around:${radius},${lat},${lon})["amenity"="restaurant"]["cuisine"~"${cuisineValue}",i];
      way(around:${radius},${lat},${lon})["amenity"="restaurant"]["cuisine"~"${cuisineValue}",i];
      relation(around:${radius},${lat},${lon})["amenity"="restaurant"]["cuisine"~"${cuisineValue}",i];
      node(around:${radius},${lat},${lon})["amenity"="cafe"]["cuisine"~"${cuisineValue}",i];
      way(around:${radius},${lat},${lon})["amenity"="cafe"]["cuisine"~"${cuisineValue}",i];
    `;
  } else {
    // General food search (existing code)
    blocks = `
      node(around:${radius},${lat},${lon})["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|bar|pub"];
      way(around:${radius},${lat},${lon})["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|bar|pub"];
      relation(around:${radius},${lat},${lon})["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|bar|pub"];
    `;
  }
}
```

---

### **Step 3: Add Amenity Filtering**

Add after the food section:

```javascript
// AMENITY QUERIES (gym, spa, parking, etc.)
else if (amenity) {
  console.log(`🏢 Searching for ${amenity} amenities`);
  blocks = `
    node(around:${radius},${lat},${lon})["amenity"="${amenity}"];
    way(around:${radius},${lat},${lon})["amenity"="${amenity}"];
    relation(around:${radius},${lat},${lon})["amenity"="${amenity}"];
  `;
}

// LEISURE QUERIES (gym, spa, sports_centre, etc.)
else if (/(gym|fitness|spa|wellness|sports)/i.test(cat)) {
  console.log(`💪 Searching for fitness/wellness facilities`);
  blocks = `
    node(around:${radius},${lat},${lon})["leisure"~"fitness_centre|sports_centre|swimming_pool"];
    way(around:${radius},${lat},${lon})["leisure"~"fitness_centre|sports_centre|swimming_pool"];
    node(around:${radius},${lat},${lon})["amenity"~"spa|gym"];
    way(around:${radius},${lat},${lon})["amenity"~"spa|gym"];
  `;
}
```

---

### **Step 4: Enhance Result Mapping**

Update the result mapping (around line 1170) to include cuisine info:

```javascript
const places = ov.elements.slice(0, 10).map(e => {
  const name = (e.tags && (e.tags.name || e.tags.operator)) || 'Unnamed';
  const latRes = e.lat || (e.center && e.center.lat) || '0';
  const lonRes = e.lon || (e.center && e.center.lon) || '0';
  const typeTag = (e.tags && (e.tags.shop || e.tags.tourism || e.tags.amenity || e.tags.leisure)) || "poi";
  
  // Include cuisine info if available
  const cuisineInfo = e.tags && e.tags.cuisine ? ` (${e.tags.cuisine})` : '';
  
  return { 
    name: name + cuisineInfo, 
    lat: String(latRes), 
    lon: String(lonRes), 
    type: typeTag,
    cuisine: e.tags && e.tags.cuisine || null,
    tags: e.tags || {}
  };
});
```

---

### **Step 5: Update Tool Calls to Pass Filters**

Update the tool handlers to extract and pass cuisine/amenity filters.

**In `searchNearbyAttractions` handler** (around line 1576):

```javascript
case 'searchNearbyAttractions': {
  let location = args.location;
  const type = args.type || 'tourist attraction';
  
  // Extract cuisine or amenity from user query if present
  const filters = {};
  
  // Check if user mentioned a cuisine
  const cuisineMatch = args.cuisine || extractCuisineFromQuery(userMessage);
  if (cuisineMatch) {
    filters.cuisine = cuisineMatch;
  }
  
  // Check if user mentioned an amenity
  const amenityMatch = args.amenity || extractAmenityFromQuery(userMessage);
  if (amenityMatch) {
    filters.amenity = amenityMatch;
  }
  
  // Use browser coordinates if available
  if (location === 'BROWSER_COORDS' && global.browserCoords) {
    location = { lat: parseFloat(global.browserCoords.lat), lon: parseFloat(global.browserCoords.lon) };
  }
  
  const result = await findPlaces(location, type, filters); // Pass filters
  // ... rest of code
}
```

---

### **Step 6: Add Helper Functions**

Add these helper functions to extract cuisine/amenity from queries:

```javascript
// Extract cuisine from user query
function extractCuisineFromQuery(query) {
  const cuisines = {
    'italian': ['italian', 'pizza', 'pasta'],
    'chinese': ['chinese', 'dim sum'],
    'mexican': ['mexican', 'tacos', 'burrito'],
    'japanese': ['japanese', 'sushi', 'ramen'],
    'thai': ['thai', 'pad thai'],
    'indian': ['indian', 'curry'],
    'french': ['french'],
    'greek': ['greek'],
    'korean': ['korean', 'bbq'],
    'vietnamese': ['vietnamese', 'pho']
  };
  
  const lowerQuery = query.toLowerCase();
  for (const [cuisine, keywords] of Object.entries(cuisines)) {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      return cuisine;
    }
  }
  return null;
}

// Extract amenity from user query
function extractAmenityFromQuery(query) {
  const amenities = {
    'gym': ['gym', 'fitness', 'workout'],
    'spa': ['spa', 'massage', 'wellness'],
    'parking': ['parking', 'park car'],
    'pharmacy': ['pharmacy', 'drugstore', 'medicine'],
    'bank': ['bank', 'atm'],
    'hospital': ['hospital', 'emergency', 'medical'],
    'library': ['library', 'books']
  };
  
  const lowerQuery = query.toLowerCase();
  for (const [amenity, keywords] of Object.entries(amenities)) {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      return amenity;
    }
  }
  return null;
}
```

---

### **Step 7: Update findPlaces Function**

Update the `findPlaces` function signature (around line 1490):

```javascript
async function findPlaces(cityOrCoords, type = 'tourist attraction', filters = {}) {
  // ... existing code ...
  
  // When calling findPlacesAroundCoords, pass filters
  const coordsPlaces = await findPlacesAroundCoords(lat, lon, radius, type, filters);
  
  // ... rest of code ...
}
```

---

## 🧪 Testing

### Test Queries:

1. **Cuisine Filtering**:
   - "Find Italian restaurants near me"
   - "Where can I get Chinese food?"
   - "Show me Mexican restaurants"

2. **Amenity Filtering**:
   - "Find a gym nearby"
   - "Where's the nearest spa?"
   - "Find parking near me"

3. **Combined**:
   - "Thai restaurants with parking"

---

## 📊 Expected Results

### Before Fix:
- Query: "Find Italian restaurants"
- Result: All restaurants (no cuisine filtering)

### After Fix:
- Query: "Find Italian restaurants"
- Result: Only Italian restaurants with cuisine tag
- Example: "Trattoria Roma (italian)", "Luigi's Pizzeria (italian)"

---

## ⚠️ Important Notes

1. **OSM Data Quality**: Not all restaurants have cuisine tags in OSM. Results may vary by location.

2. **Fallback**: If no results with cuisine filter, consider falling back to general restaurant search.

3. **Case Insensitive**: The `,i` flag in Overpass QL makes searches case-insensitive.

4. **Performance**: Specific filters may return fewer results but are more relevant.

---

## 🚀 Implementation Checklist

- [ ] Update `findPlacesAroundCoords` function signature
- [ ] Add cuisine filtering logic
- [ ] Add amenity filtering logic
- [ ] Enhance result mapping to include cuisine
- [ ] Add helper functions for extraction
- [ ] Update `findPlaces` to pass filters
- [ ] Update tool handlers to extract filters
- [ ] Test with various queries
- [ ] Add fallback for no results
- [ ] Document supported cuisines/amenities

---

## 💡 Future Enhancements

1. **Dietary Filters**: vegetarian, vegan, halal, kosher
2. **Price Range**: budget, moderate, expensive
3. **Rating Filter**: minimum rating threshold
4. **Opening Hours**: filter by currently open
5. **Distance Sort**: sort by proximity
6. **Multi-Cuisine**: support multiple cuisines in one query

---

**Status**: Ready to implement  
**Estimated Time**: 30-45 minutes  
**Priority**: HIGH (improves search relevance significantly)

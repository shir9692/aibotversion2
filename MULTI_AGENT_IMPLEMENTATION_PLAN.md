# 🤖 Multi-Agent "Concierge Council" - Implementation Plan

## 📋 Overview
Implement a **Multi-Agent System** (MAS) where a "Council" of specialized AI agents collaborates to handle complex guest requests (e.g., full itineraries, event planning, complex problem solving). This moves beyond a single agent to a **Supervisor-Worker** architecture.

**Goal**: Deliver deeper expertise and better error checking for complex tasks by separating concerns into specialized personas.

---

## 🏗️ Architecture: The "Concierge Council"

### 1. The Supervisor (Orchestrator)
- **Role**: The "Head Concierge".
- **Responsibilities**: 
  - Analyzes user request complexity.
  - Decomposes the task into sub-tasks.
  - Delegates to specific sub-agents.
  - Synthesizes sub-agent responses into a final cohesive answer.
  - **Does NOT** call external tools directly (delegates this).

### 2. The Sub-Agents (Workers)
Each agent has a unique `System Prompt` and specific `Tools`.

| Agent Name | Role | Specialty | Tools |
|------------|------|-----------|-------|
| **Gastronomy Expert** | Food Critic | Finds the best dining experiences, deeply understands cuisine, dietary needs, and atmosphere. | `searchFoodPlaces` |
| **Events Specialist** | Social Coordinator | Finds local events, manages tickets, knows the "vibe" of venues. | `searchLocalEvents`, `searchNearbyAttractions` |
| **Logistics Manager** | Operations | Handles "boring" practicality: travel times, weather safety, budget limits. | `getTransportationInfo`, `getCurrentWeather` |

---

## 📝 Implementation Code Plan

### **Step 1: Define Agent Persona Classes**

Create a structure to hold agent definitions in `server-with-azure-ai.js`.

```javascript
/* 
  MULTI-AGENT DEFINITIONS 
*/
const AGENTS = {
  SUPERVISOR: {
    role: "Head Concierge",
    systemPrompt: "You are the Head Concierge. Your goal is to manage a team of experts to solve complex guest requests..."
  },
  GASTRONOMY: {
    role: "Gastronomy Expert",
    systemPrompt: "You are a Michelin-star level food critic and concierge. You focus ONLY on dining quality, menu analysis, and restaurant atmosphere..."
  },
  EVENTS: {
    role: "Event Specialist",
    systemPrompt: "You are the city's best event planner. You know every concert, gallery opening, and show..."
  },
  LOGISTICS: {
    role: "Logistics Manager",
    systemPrompt: "You are a pragmatic logistics manager. Your job is to ensure plans are realistic, timely, and weather-appropriate..."
  }
};
```

### **Step 2: Implement `runAgentChain` Function**

Create the orchestration logic. This function is triggered when a request is deemed "Complex".

```javascript
async function runAgentChain(userRequest, sessionId) {
  // 1. Supervisor Break-down
  // Ask Supervisor to plan the execution.
  // Output: JSON plan { steps: [{ agent: "GASTRONOMY", task: "..." }, { agent: "EVENTS", task: "..." }] }
  
  // 2. Parallel Execution
  // Loop through steps and call Azure OpenAI with specific Agent System Prompts
  
  // 3. Synthesis
  // Feed all Agent outputs back to Supervisor to form final response
}
```

### **Step 3: Modify Main Handler**

Update `handleAzureAIAgent` to determine when to use the Single Agent (default) vs. the Multi-Agent system.

```javascript
// Heuristic or LLM-based router
const isComplex = userMessage.length > 100 && (userMessage.includes("plan") || userMessage.includes("itinerary"));

if (isComplex) {
   return await runAgentChain(userMessage);
} else {
   // Standard single-agent flow
}
```

---

## 🧪 Example Workflow

**User**: *"Plan a romantic anniversary evening. We want authentic Italian food, maybe a jazz club after, but we need to be clear of the rain and back by 11pm."*

1. **Supervisor** creates plan:
   - Task 1 (Gastronomy): "Find romantic Italian dinner spots."
   - Task 2 (Events): "Find jazz clubs open tonight."
   - Task 3 (Logistics): "Check rain forecast and plan timeline to finish by 11pm."

2. **Agents Execute**:
   - **Gastronomy** returns: "Luigi's Trattoria (Intimate, 4.8 stars)"
   - **Events** returns: "The Blue Note (Show at 9pm)"
   - **Logistics** returns: "Rain starting 10pm. Recommend taxi. Dinner 7-9pm, Jazz 9-10:30pm, Taxi 10:30pm."

3. **Supervisor Synthesizes**: 
   "Happy Anniversary! I've arranged a special evening. Start with dinner at **Luigi's** (it's intimate and authentic). Then, head to **The Blue Note** for jazz. I noticed rain is forecasted for 10 PM, so I recommend a taxi back to ensure you're dry and home by 11 PM."

---

## 🚀 Deployment Strategy
1. **Scaffold**: Add `AGENTS` constant and `runAgentChain` placeholder.
2. **Logic**: Implement the "Supervisor" planning prompt.
3. **Integration**: Connect sub-agents to specific subsets of the `agentTools`.
4. **Test**: Run specific complex queries to validate "Hand-offs".



// ============================================
// MULTI-AGENT ORCHESTRATION SYSTEM
// ============================================

const AGENTS = {
    SUPERVISOR: {
        role: "Head Concierge",
        systemPrompt: "You are the Head Concierge. Your goal is to manage a team of experts to solve complex guest requests. \n" +
            "Analyze the user request and breakdown the task into specific sub-tasks for your team. \n" +
            "Return a JSON object with a 'plan' array, where each item has 'agent' (GASTRONOMY, EVENTS, LOGISTICS) and 'instruction'.\n" +
            "Do not answer the user directly. Delegate to your team."
    },
    GASTRONOMY: {
        role: "Gastronomy Expert",
        systemPrompt: "You are a Michelin-star level food critic and concierge. You focus ONLY on dining quality, menu analysis, and restaurant atmosphere. Use the searchFoodPlaces or findPlaces tools (restaurant category) if needed."
    },
    EVENTS: {
        role: "Event Specialist",
        systemPrompt: "You are the city's best event planner. You know every concert, gallery opening, and show. Use searchLocalEvents or searchNearbyAttractions tools."
    },
    LOGISTICS: {
        role: "Logistics Manager",
        systemPrompt: "You are a pragmatic logistics manager. Your job is to ensure plans are realistic, timely, and weather-appropriate. Check weather and transport options."
    }
};

async function runAgentChain(userMessage, sessionId) {
    console.log(`🤖 Starting Multi-Agent Chain for: "${userMessage}"`);

    // 1. Supervisor Phase
    const supervisorMessages = [
        { role: 'system', content: AGENTS.SUPERVISOR.systemPrompt + "\nRespond ONLY with JSON format: { \"plan\": [{ \"agent\": \"AGENT_NAME\", \"instruction\": \"...\" }] }" },
        { role: 'user', content: userMessage }
    ];

    let plan = null;
    try {
        const supResponse = await azureOpenAIClient.chat.completions.create({
            model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages: supervisorMessages,
            response_format: { type: "json_object" },
            temperature: 0.3
        });
        const content = supResponse.choices[0].message.content;
        plan = JSON.parse(content);
        console.log('📋 Agent Plan:', JSON.stringify(plan, null, 2));
    } catch (e) {
        console.error('Supervisor failed:', e);
        return null; // Fallback to standard flow
    }

    if (!plan || !plan.plan || plan.plan.length === 0) return null;

    // 2. Execution Phase
    const agentResults = [];

    for (const step of plan.plan) {
        const agentName = step.agent.toUpperCase();
        const instruction = step.instruction;
        const agentDef = AGENTS[agentName];

        if (!agentDef) continue;

        console.log(`👷 Agent ${agentName} working on: ${instruction}`);

        const agentMessages = [
            { role: 'system', content: agentDef.systemPrompt },
            { role: 'user', content: instruction }
        ];

        try {
            // Agents have access to tools
            let response = await azureOpenAIClient.chat.completions.create({
                model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages: agentMessages,
                tools: agentTools,
                tool_choice: 'auto'
            });

            let msg = response.choices[0].message;
            let finalContent = msg.content;

            // Handle tool calls if any (Single turn max for this demo)
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                const toolResults = [];
                for (const tc of msg.tool_calls) {
                    // Pass formatted args if needed
                    const result = await executeToolCall(tc, instruction);
                    toolResults.push({
                        tool_call_id: tc.id,
                        role: 'tool',
                        name: tc.function.name,
                        content: JSON.stringify(result)
                    });
                }

                // Get final response after tools
                agentMessages.push(msg);
                agentMessages.push(...toolResults);

                const secondResponse = await azureOpenAIClient.chat.completions.create({
                    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
                    messages: agentMessages
                });
                finalContent = secondResponse.choices[0].message.content;
            }

            agentResults.push(`[${agentName}]: ${finalContent}`);

        } catch (err) {
            console.error(`Agent ${agentName} failed:`, err);
            agentResults.push(`[${agentName}]: Failed to execute task.`);
        }
    }

    // 3. Synthesis Phase
    console.log('🔗 Synthesizing results...');
    const synthesisMessages = [
        { role: 'system', content: "You are the Head Concierge. Synthesize the reports from your team into a cohesive, warm, and professional response for the guest. Do not mention internal processes or 'agents'. Just give the helpful recommendation." },
        { role: 'user', content: `Original Request: ${userMessage}\n\nTeam Reports:\n${agentResults.join('\n\n')}` }
    ];

    const finalResponse = await azureOpenAIClient.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        messages: synthesisMessages
    });

    return finalResponse.choices[0].message.content;
}

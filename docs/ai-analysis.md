# AI Analysis

- Provider-independent `AIProvider` interface (analyzeActivity, suggestActivityCategory, suggestActivityGroup, compareActivities, classifyInefficiency, analyzeAutomationFeasibility, generateOpportunity, generateFutureState, summarizeDepartmentAnalysis).
- MVP ships `MockAIProvider`; real providers (Azure OpenAI, Anthropic) are later adapters.
- Inputs are pseudonymized per campaign (Employee_01...). No names or emails ever leave the app.
- Every response is validated against a versioned Zod schema; invalid output marks the run failed and never touches stored state.
- Results are cached by input content hash; "Re-run" creates a new AIAnalysisRun version. Store provider, model, prompt version, schema version, input version, status, trigger.
- Confidence is High/Medium/Low only. Low findings enter Final Analysis only after manager validation.
- AI never decides legality of tools, never invents steps, savings or capabilities, never labels work "worthless".

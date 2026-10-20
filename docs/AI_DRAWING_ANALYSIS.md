# AI drawing analysis

The member **แปลน / Detail** panel supports an optional AI gateway. The browser never receives an AI provider key and no longer downloads or uploads the drawing for analysis. It sends only JSON containing the Firebase project/member IDs, `attachmentId`, member category, current dimensions/cover, and the fields requested by the application. The Gateway looks up the attachment record, downloads the original bytes directly from Firebase Storage, and forwards those original bytes to the selected AI provider without converting or validating the file contents.

Configure the gateway URL with `VITE_AI_DRAWING_ANALYSIS_ENDPOINT`. The browser sends the signed-in Firebase ID token as `Authorization: Bearer <token>`, so the gateway verifies the token and project access before forwarding the file to an AI provider. It does not perform content, MIME, size, or SHA256 validation on the file itself.

This repository now includes a Firebase Functions v2 gateway at `functions/index.js`. Firebase Hosting target `site-02` rewrites `/analyse-drawing` to the `analyseDrawing` function in `asia-southeast1`, so the deployed app can use:

```ini
VITE_AI_DRAWING_ANALYSIS_ENDPOINT=https://cmg-boq-bbs.web.app/analyse-drawing
```

Deploy the gateway and the Hosting target with `firebase deploy --only functions:analyseDrawing,hosting:site-02 --project my-boq-app`. The function reads the active provider configuration from Firestore with Admin credentials, verifies an approved Firebase account and project assignment, and never returns the provider API key to the browser.

An approved MasterAdmin can configure the active provider, model, provider-specific thinking setting, and provider API key from the **จัดการ API** menu. The active provider/model/thinking selection is included in the request context as a structured `aiThinking` object; the gateway must translate it to the selected provider's request schema and must not treat all providers as having the same generic levels:

- OpenAI Responses API: `{ "kind": "openai-reasoning-effort", "effort": "low" }` maps to `reasoning.effort`.
- Anthropic Messages API: `{ "kind": "anthropic-adaptive-effort", "effort": "high" }` maps to `thinking: { "type": "adaptive" }` and `output_config.effort`.
- Gemini 3/4: `{ "kind": "gemini-thinking-level", "level": "high" }` maps to `generationConfig.thinkingConfig.thinkingLevel`.
- Gemini 2.5: `{ "kind": "gemini-thinking-budget", "budgetTokens": 4096 }` maps to `generationConfig.thinkingConfig.thinkingBudget`.

The provider key is not sent by the browser; a trusted gateway should read the Firebase configuration with server-side credentials or use an equivalent server-side secret store. The current app stores the provider configuration at `${VITE_APP_NAME}/root/apiProviders/config`; the application checks MasterAdmin access, and production Firestore Rules must enforce the same restriction on this path.

The gateway now returns Server-Sent Events (`text/event-stream`) for one analysis request. Progress events contain only a phase and user-facing status, for example:

```json
{"type":"progress","phase":"analyzing","label":"AI กำลังอ่านและวิเคราะห์แบบ…"}
```

The final event is `type: "result"` and contains the same JSON object below. A non-streaming JSON response is still accepted by the browser as a compatibility fallback. The gateway uses each provider's native streaming request (`stream: true` for OpenAI Responses and Anthropic Messages, and `streamGenerateContent?alt=sse` for Google AI Studio), then prepares one complete JSON result before applying it to the member preview.

The final result should have this shape (the `analysis` or `result` wrapper is also accepted):

```json
{
  "version": 1,
  "provider": "provider-name",
  "model": "model-name",
  "confidence": "High",
  "dimensions": [
    {"axis":"x","value":6000,"label":"L","source":"หน้า 1: ..."},
    {"axis":"y","value":300,"label":"W","source":"หน้า 1: ..."},
    {"axis":"z","value":600,"label":"H","source":"หน้า 1: ..."},
    {"axis":"cover","value":40,"label":"cover","source":"หน้า 1: ..."}
  ],
  "reinforcement": [
    {"mark":"B1","diameter":16,"count":4,"grade":"SD40","axis":"X","face":"bottom","source":"หน้า 2: ..."}
  ],
  "fields": {
    "description":"คานคอนกรีตเสริมเหล็ก",
    "cover":40,
    "pedestal":{"x":0,"y":0,"z":0},
    "lean":{"x":0,"y":0,"thickness":0},
    "excavation":{"bottomX":0,"bottomY":0,"topX":0,"topY":0,"depth":0,"buriedConcrete":0}
  },
  "calculated":{"concrete":1.08,"formwork":14.4,"rebar":123.4,"quantity":1},
  "evidence":[{"page":1,"field":"x","quote":"6000"}],
  "textSample":"...",
  "warnings":["ตรวจสอบหน่วย mm กับแบบต้นฉบับ"]
}
```

AI results are always shown as **Needs review**. Applying them only updates the member's draft dimensions/cover and stored drawing-extraction evidence; it does not approve the member, create BBS bars, or release a BOQ/BBS revision. The actual concrete/formwork/rebar values shown after applying are recalculated by the existing application engine.

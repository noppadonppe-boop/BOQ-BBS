# AI drawing analysis

The member **แปลน / Detail** panel supports an optional AI gateway. The browser never receives an AI provider key and no longer downloads or uploads the drawing for analysis. It sends only JSON containing the Firebase project/member IDs, `attachmentId`, member category, current dimensions/cover, and the fields requested by the application. The Gateway looks up the attachment record, downloads the original bytes directly from Firebase Storage, and forwards those original bytes to the selected AI provider without converting or validating the file contents.

Configure the gateway URL with `VITE_AI_DRAWING_ANALYSIS_ENDPOINT`. The browser sends the signed-in Firebase ID token as `Authorization: Bearer <token>`, so the gateway verifies the token and project access before forwarding the file to an AI provider. It does not perform content, MIME, size, or SHA256 validation on the file itself.

This repository now includes a Firebase Functions v2 gateway at `functions/index.js`. Firebase Hosting target `site-02` rewrites `/analyse-drawing` to the `analyseDrawing` function in `asia-southeast1`, so the deployed app can use:

```ini
VITE_AI_DRAWING_ANALYSIS_ENDPOINT=https://asia-southeast1-my-boq-app.cloudfunctions.net/analyseDrawing
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

The final event is `type: "result"` and contains the same JSON object below. A non-streaming JSON response is still accepted by the browser as a compatibility fallback. The gateway uses native streaming for OpenAI Responses and Google AI Studio, while Anthropic uses a complete JSON response for reliable document-analysis output; the gateway then prepares one complete JSON result before applying it to the member preview.

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

## Task `slabPlan` (S4b · slab floor import from a PDF / DXF window, schedules)

Request `context`: `task: 'slabPlan'`, `part: 'plan' | 'schedule'`, `scheduleKind: 'slab' | 'beam'`, `page`, `views` (overview
+ up to 6 tiles of the chosen window, JPEG base64, each ≤ 5 MB, ≤ 20 MB total), `frames` (label, pixel size, window in page
points), `texts` ([{id, text, x, y}] page texts with view-0 pixel positions), `layers` ([{name, count, role?}] pseudo-layers),
`ruleSummary` (the rule result as text), `answers` (earlier questions answered by the user), plus the usual project / member /
attachment ids and the provider selection. The gateway **does not download or send the original file** for this task
(`loadAttachmentFromStorage` skips it; `sendsOriginal` false) and refuses unless `projects/{id}.aiConsent.enabled === true`
(403). The prompt is `slabPlanInstruction()`; the answer is returned with an envelope (`provider`, `model`, `attachmentId`,
`page`) by `normaliseSlabPlan()` and checked in the browser (`aiFloorProposalSchema` / `aiScheduleSchema` in
`src/domain/aiSlabPlan.ts`). Plan answer: `layers [{name, role, confidence}]`, `grids [{axis, label, at:{view,x,y}}]`, `beams
[{mark, width, depth, a, b}]`, `columns [{mark, at, sx, sy}]`, `openings [{label, shape, a, b}]`, `panelMarks [{mark, thickness,
at}]`, `questions`, `warnings`; every item has `confidence` (0–1) and `evidence` (`view` + `box` pixels and / or `quote` /
`textIds`). Schedule answer: `{task:'slabSchedule', kind, header, rows, confidence, questions, warnings}`.

The browser asks only when the user presses an AI button, after a confirmation naming provider / model / file / page /
window, and logs every send on the project (`logAiSend`). Results always go to the review step; nothing is applied
automatically.

### Deploy (owner)

The task is in `functions/index.js` but **not deployed**. To enable it:
1. Review the diff of `functions/index.js` (`slabPlanInstruction`, `normaliseSlabPlan`, the `slabTask` branch, the download
   skip in `loadAttachmentFromStorage`).
2. `firebase deploy --only functions:analyseDrawing --project my-boq-app` (Hosting is unchanged; add `hosting:site-02` only
   when deploying a new web build as usual).
3. Make sure `VITE_AI_DRAWING_ANALYSIS_ENDPOINT` points at the function in the web build and the active provider / model /
   API key are set in “จัดการ API”.
4. In each project that may use it, an admin switches on “อนุญาตส่งแบบให้ AI” (project settings).
5. Check: import window › step 3 › “ให้ AI ช่วยตรวจ / เติม…” → the confirmation → the result rows marked AI; the project
   settings show the send in the log. Until then the AI buttons say why they are off and the rest of the import works.

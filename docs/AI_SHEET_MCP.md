# Grouped drawing analysis and modeling MCP

## In the application

Open the source-file panel and select a current PDF, PNG or JPEG. The new **AI อ่านแบบรวม → แยกชิ้นงาน → สร้าง 3D** panel works with both member and project source files.

1. Set the number of pages to survey (first 10 by default, up to 40). Each page is a separate AI request. The UI reports any pages not surveyed.
2. Survey the sheet. The backend renders an overview, asks for groups keyed by printed member code, and returns normalized boxes for plans, sections, elevations, details, notes and schedules. Equal codes across surveyed pages are merged; different codes remain separate. Overlays show the regions. Advanced editing can correct grouping and crop boxes before the detailed read.
3. Select groups and read their details. The backend renders each selected region from the original bytes, up to 2600 pixels on its long edge. Vector PDFs are re-rendered at higher resolution; raster images are never enlarged beyond their original pixel resolution. Up to 24 regions per group are supported.
4. AI receives the crops, region/page identities, project specification and the actual modeling tool catalog including JSON schemas. It returns dimensions, evidence, unresolved questions/conflicts, and an ordered command list. The app runs these commands through its existing geometry/rebar engines. It does not use AI-estimated quantities as application totals.
5. Failed result-schema or command validation gets one AI repair attempt with the same crops and error. Unresolved dimensions/conflicts and a mismatch between the summary dimensions and model bounds prevent creation. Results can be corrected in the advanced editor with evidence before creation.
6. **อ่านละเอียดและสร้าง 3D** automatically creates one new member per validated group through the existing `saveMember` path with duplicate-code detection, project authorization and version checks. No MCP JSON upload is required. The 3D preview and saved status appear in the result card; unresolved results stay available for correction and manual creation. Groups already saved in the current analysis are skipped on repeat clicks. Members remain Draft with provisional quantities. The extraction record retains original attachment identity, evidence and source SHA256; the result JSON can also be downloaded. Original attachments are not copied/reassigned to each new member.

The grouped pipeline sends the browser only results and overview images. File loading and crop generation happen on the backend. SHA256 binds detailed requests to the surveyed source. Existing single-member/single-shape analysis remains available separately.

## Modeling tool registry

`src/domain/aiModelTools.ts` is shared by the browser, the backend's bundled validator and the MCP server. It exposes:

- Metadata, occurrence quantities and locations.
- Shape models: box, polygon, cylinder/ring, shaft, solid/void, pour stages, piles, site/earthwork and rebar notes; add/replace/remove parts.
- Polygon/circular, inclined and tapered prisms; multi-span beams.
- Structured Foundation/Beam/Column/Slab/Wall inputs and their generated reinforcement, plus template discovery.
- Meshes, perimeter hoops, vertical face bars, sketched bars, full bar definitions (including curves/helixes/offsets), and bar removal.
- Adjacent placement-context geometry for continuity.
- Drawing metadata and section configuration, BBS setup, plan/section primitives, and complete A3 sheet primitives.
- Model inspection: geometry/surfaces, validation, quantities and BBS calculated by the existing engines.

This is a modeling interface, not an administrative interface. It does not expose project deletion, issuance, approval, billing, user administration or publication. PDF registration/export continues through the existing app workflow. All command sequences are applied to an isolated draft; an error does not partially save to Firestore.

## Build and deploy

```sh
npm ci
npm ci --prefix functions
npm run build
node --test tools/ai/test.mjs
```

`npm run build` also runs `tools/ai/build.mjs`, producing:

- `functions/lib/model-tools.cjs`: backend validation and tool catalog, included in the Functions deployment source. This generated file is not versioned; build before deploying.
- `dist/mcp/model-server.mjs`: standalone stdio MCP server.

The owner must deploy the updated `analyseDrawing` Function and frontend before the feature works against Firebase Cloud. No Firebase rules, environment values or hosting configuration are changed by this implementation. Native dependencies (`@napi-rs/canvas`, `sharp`) install for the deployment platform; PDF.js and the renderer must resolve the same canvas version. Functions targets Node 22.

## Connect an MCP client

Use `node` as the command and the absolute path to `dist/mcp/model-server.mjs` as its argument. For example:

```json
{
  "mcpServers": {
    "boq-bbs-model": {
      "command": "node",
      "args": ["C:/Users/Administrator/Documents/Project Code/BOQ-BBS/dist/mcp/model-server.mjs"]
    }
  }
}
```

The server implements newline-delimited JSON-RPC over stdio, MCP protocol `2025-06-18`, `initialize`, `ping`, `tools/list`, and `tools/call`. Standard output is reserved for protocol messages. See the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) and [tool specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

Call `draft_open` with a code or existing member JSON and the project's spec, then call the listed modeling tools. `draft_export` returns `{member,spec}`. Save that JSON and use **นำเข้าแบบร่างที่สร้างผ่าน MCP** in the source panel to preview and create a new member under the signed-in app user's permissions.

MCP draft state is process-local and disappears when that client exits. The stdio server does not connect to Firebase or edit a running browser. The in-app AI gateway uses the same executable registry through a JSON command plan, not a remote MCP transport or provider-native tool-call loop. No MCP client is configured automatically.

## Verification and limits

`tools/ai/test.mjs` covers source cropping (raster and PDF), grouping, evidence identity, digest mismatch, command validation/repair, independent drafts, polygon/void quantities, reinforcement, drawing views and a real MCP subprocess handshake/call/export. AI responses are mocked; accuracy of a particular provider/model on real project drawings still requires a deployed end-to-end check.

Surveying and detailed reads are separate billable requests to the selected provider. Requests run sequentially, and cancel preserves results already completed. Results are held in the current panel until saved/downloaded. Cross-file grouping is not yet automatic; matching codes are merged across pages of the selected file only. Small text absent from raster pixels cannot be recovered by zooming.

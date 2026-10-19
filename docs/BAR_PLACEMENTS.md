# Individual bar positions — v0.53

One Mark can contain copies of the same bar shape at individually specified locations and orientations. This supports irregular repetition and differently oriented copies without making a separate Mark for every physical location. Different bar shapes or cut lengths still need separate Marks. This is entered geometry, not automatic drawing interpretation or engineering approval.

## Use

1. Close or reload older app tabs before adopting this release. In General Spec choose `รุ่น 1 · กำหนดตำแหน่งและทิศทางรายแท่ง`, then save Draft specifications. Existing uniformly distributed bars keep their original paths until explicitly converted. Saved Frozen revisions retain their own inputs and calculation identity.
2. In a Mark editor open `กำหนดตำแหน่งและทิศทางรายแท่ง` and start from the existing positions. Enter the source drawing or the reason for the chosen layout. The first template point and the pivot use the member's common coordinate system, in mm. The origin of a targeted solid is already included.
3. Enter one row per bar: `ID, offset X, offset Y, offset Z, rotate X, rotate Y, rotate Z`. Offsets are mm; rotations are degrees. IDs use letters, digits, underscores or hyphens, up to80 characters. The first row uses zero offset and zero rotation; the template anchor determines its location. The range helper creates inclusive exact spacing intervals and additional IDs. It refuses an end station that does not match the entered spacing.
4. Check the preview against the drawing, plan, section and3D. Apply the positions, apply the bar set, then save the member. Applying a layout derives the bar count from the rows and clears placement/dimension confirmations. Merely previewing does not save anything. Quantity still multiplies the selected occurrence count once.
5. To return a Mark to the old distribution method, remove its individual positions in the editor and review the resulting paths. The project policy cannot be removed while any member still contains individual positions.

## Coordinates and quantities

Rotations are active rotations around the member's fixed axes, in order X, then Y, then Z about the supplied pivot. The offset is applied after rotation. Each pose transforms the same template; it cannot change the shape or the cut length. A straight bar rotated90 degrees around Z therefore changes direction in the plan without becoming a different cut. The template first point is independent of the pivot.

The layout is version1 and requires a source/basis. The project policy is optional `bar-placement-1.0`. Enabling it appends `+bar-placement-1.0` to the calculation identity, after any earthwork policy suffix. Supplied BS8666:2000+Amd1/2 numerical rules and the startup v7 profile remain unchanged. Existing layouts without this opt-in field are never inferred from count or migrated automatically.

The current validator checks row count, finite input, schema/version, unique IDs and transforms, physical coincident paths, the existing concrete/context boundary checks and cover checks. It permits up to2,000 positions per Mark within the existing20,000 paths/member budget. These checks do not certify bar-to-bar clearance, bend closure, anchorage, ACI318 design or an approved installation detail.

## Saved work and exports

The optional layout is part of member inputs and captured snapshots. Copies generate new pose IDs and reset confirmations while retaining the physical layout and its basis. Backup/Restore retains the layout and historical artifacts; restored Working members are Draft and require review. Analytic arc/helix centre metadata is rebased to the first anchored template location; cut and mass calculations keep their existing numerical policy.

When individual positions are present, the existing application Excel export adds `Placement Basis` and `Bar Placements`. The basis records anchor, pivot, source, bars per element and selected element quantity. Physical rows record pose ID, offset, rotation, and actual first/last points within one member. They are not a separate multiplier for BOQ. Typed numbers are retained; six decimal places are display precision only. Other sheets keep their captured quantities and reinforcement coverage.

The existing A3/A1 BBS PDF adds a placement basis and a paginated coordinate table. The plan/section and3D use all transformed paths. Owner frame metadata is retained when a project frame is configured, with continuous member sheet numbering across the base drawing and added pages. Generic frames retain their base drawing sheet number and use a separate `Placement appendix` page count. A coordinate table is supplementary installation information and still requires drawing review. The export explicitly refuses a combined drawing over500 pages; split a large scope rather than relying on silent truncation.

## Acceptance limits

Old clients do not understand the new optional layout and can lose its fields during a subsequent save. Closing/reloading older tabs is required before adoption. Mixed-version rollout and production enforcement are not accepted by client-side checks. The user's Rules, Firebase configuration, environment and Auth initialization are not changed or deployed for this feature.

Synthetic software QA does not replace an independent approved real-project case. Real GULF bar reconstruction, engineering/owner acceptance, BS code33, code51 physical closure, ACI policy, Issued release, native Excel printing and production acceptance remain pending. The original12 requirements remain the controlling scope.

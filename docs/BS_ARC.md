# Continuous circular arc — v0.31

The supplied `Referrence/BS 8666.pdf` is BS8666:2000+Amd1/2. Table1, printed p8/PDF p12, defines code67 with A as arc length and R at the inside surface. Clause10/Table5, printed p13/PDF p17, specifies the supply instruction. This is the supplied startup minimum, not a claim about the current edition or complete BS/ACI conformity.

New projects use immutable minimum policy `bs8666-2000-v5`. Existing projects adopt it explicitly in General Spec, which clears member confirmations and returns edited work to Draft. Existing v1/v2/v3/v4 Frozen records retain their numerical policy. V5 uses `geometry-2.1+bs8666-2000-v5`; earlier policies retain `geometry-2.0`. Code67 is not formula-enabled under those older policies.

## Enter and position an arc

Open a member, add/edit a Mark and expand the code67 arc builder. Enter A and inside R in 5mm increments, select XY/XZ/YZ and create the arc. Confirm actual outside/rib diameter and the material-to-BS-type mapping. The builder uses centreline R = inside R + outside diameter/2, and sweep = A/centreline R in radians. It checks the selected solid, exact extrema, cover and voids. A closed360° ring requires a separate join/lap/shape decision; this builder creates only open arcs.

The saved primitive contains a centre, orthonormal u/v plane axes and sweep. The centre fields refer to the first bar in local coordinates of the selected concrete solid; its origin is added for member coordinates. A single bar stays at that exact centre. Multiple bars repeat along the plane normal through the entered total span, including both endpoints. Moving the centre/span/sweep clears confirmations. Both the bar dialog and member must be saved.

## Length and source meaning

A is the analytic centreline arc length, never a chord or a sum of sampled stations. For nominal/outside16mm, A1005mm and inside R1000mm: centreline R1008mm, sweep57.125256°, analytic A1005mm and a25mm upward-rounded cut1025mm. For nominal16/outside20mm, inside R1000mm gives centreline R1010mm. Outside diameter controls the curve surfaces; nominal diameter controls mass.

The code67 pure arc does not inherit the Table3 r-minimum/end5d/inter-bend4d checks for straight-ended shapes, or multiple deductions from its display segments. Its A/R have no Table1 free dimension. These narrow checks do not resolve structural minimum radii, anchorage, fabrication tolerance, ACI requirements or engineer approval. Manual cut overrides remain explicitly pending and do not alter analytic A.

Table5 distinguishes bars and wires by verified BS type and nominal diameter. Inside R strictly greater than the mapped limit displays `Supply straight / form during placing`; equality remains `Preformed radius required`. For a16mm bar the limit is7500mm. This changes the supply instruction only: the installed curve remains curved, and its length/mass/placement remain analytic. Unknown mappings stay pending. The application does not substitute a straight rod in the installed model or approve field bending.

## Views and exports

The two-line detail shows true inside/outside curves. Its A leader follows an arc and R points to the inside surface. Large-radius leaders may be shortened and are explicitly NTS. The coordinate detail has one continuous C01 and exactly three actual stations: start, analytic halfway and end. These are not virtual bend corners. 2D/3D use the same primitive; the standard X/Y/Z view controls remain available.

Display sampling targets0.1mm sagitta and caps at720 segments. A disclosed conservative sagitta allowance is added to cover checks even when the cap is reached; sample lengths are never used for BOQ or stock demand. The100km centreline radius cap is an application numeric guard, not a standard requirement.

Genuine Excel exports append **Curve Geometry** only when arcs exist: inside/centreline R, sweep, independently recalculable analytic A, captured cut/quantity, local/member first centre, u/v/normal, repeat span, sampling uncertainty, Table5 limit/instruction and engine version. The A reference formula can be explored without changing captured Frozen BBS cuts; cut/quantity links still refer to the source BBS sheet. Oversized display-station JSON is explicitly omitted from the old cell and replaced by complete analytic parameters in this sheet. Existing non-arc workbook source columns and values retain their meaning.

A3/A1 fabrication drawings show the two-line A/R detail and shared member placement/Mark leaders. A3/A1 coordinate drawings distinguish C01 sweep from discrete bends and name the three stations. A4 schedules identify A/R and Table5 separately. All test exports are Frozen/Draft, **NOT FOR CONSTRUCTION**. The Table4 adapter presents cut-length reference only for code67; it does not silently treat A arc/R radius as ordinary outside bending dimensions or compensate cumulative tolerances.

## Evidence and remaining work

See [current verification report](../output/arc-verification/DEVELOPMENT_REPORT.html) for software tests, genuine downloaded Excel/PDF/ZIP artifacts, independent numerical checks, local access boundaries and preserved historical snapshots. The examples are synthetic, not an approved GULF/owner pilot. Native Microsoft Excel pagination, engineer-approved cases, shapes33/51/77, complete BS/ACI, arbitrary assemblies and production operations remain in scope. Issued and production stock consumption remain closed.

The user manages Rules and deployment. This increment must not edit or deploy Firestore/Storage Rules, alter `.env`, restore Cloud Functions or claim local emulator evidence accepts the user's live Rules. Existing services and checkpoints are preserved; a new local export is a separate checkpoint, not a full-database parity/reimport or production recovery test.

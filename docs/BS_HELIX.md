# BS 8666 supplied minimum — code 77 / v0.32

Code 77 represents one continuous uniform 3D helix. Its input dimensions are A (outside diameter of the transverse circle, mm), B (axial pitch per turn, mm), and C (number of turns, including fractional turns). C is neither a millimetre dimension nor the number of separate bars. Set bars per member to 1 for one helix; member occurrences multiply that one complete bar.

## Source and numerical policy

Source: the supplied `Referrence/BS 8666.pdf`, BS 8666:2000 with Amendments 1/2, SHA256 `9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43`. Table 1, printed page 8 (PDF page 12), gives Cπ(A − d) and excludes that formula when B > A/5. This is the supplied historical project minimum, not a claim of conformity to a current edition or all of BS/ACI.

Minimum v6 (`bs8666-2000-v6`, `bs8666-2000-minimum-6.0`) and engine `geometry-2.2+bs8666-2000-v6` implement:

- B ≤ A/5, including equality: the prescribed Table 1 reference Cπ(A − nominal d).
- B > A/5: exact uniform helix centreline length C√((2πRc)² + B²), where Rc = (A − actual outside bar diameter)/2. The source requires another calculation in this case; the 3D expression is this application's documented method.
- Exact 3D length remains visible beside the prescribed approximation. The selected cut rounds upward once using the project increment. Mass uses nominal diameter, not rib envelope diameter.
- A and B use the existing 5 mm scheduling increment; C retains fractional turns. There is no standard free A/B/C dimension for this shape. Table 4 cut-length references do not create pitch/diameter/turn tolerance bands or compensate the geometry.

New projects use v6. Existing projects adopt it explicitly, which clears Draft confirmations. Earlier v1 through v5 Frozen numerical policies and captured results remain pinned; reference-only restored revisions do not become operative releases.

## Input and placement

In a member's BBS editor select the supplied BS method and a checked BS material mapping, enter actual outside diameter, open “สร้างรูป 77”, enter A/B/C, choose XY/XZ/YZ and right/left hand, and create the helix. The stored frame comprises the literal first axis centre, independent orthonormal U/V/axis vectors, pitch and turns. It supports rotated/reflected frames and fractional turns.

Changing the axis centre, pitch or turns clears confirmations. Check the dimension and placement against the source drawing, use the bar, and save the member. For multiple complete helices, the entered total repeat span follows the helix axis. It does not centre a single bar implicitly. Cover and target-solid bounds include the sampled display's sagitta allowance; the algorithm also checks nonlocal turns of the same helix for overlap. It does not certify collisions between different Marks or repeated helices, reinforcement design, seismic confinement, lap, anchorage, hook/end details, or fabrication feasibility.

Table 3 minimum radius is conservatively compared to the transverse circle's inside radius, with the distinction shown to the user. This is not the helix's osculating curvature radius or engineering approval of a 3D bending process. Continuous helices do not receive invented straight-leg deductions or end lengths.

## Views and deliverables

The dimension view has an A reference circle, an axial view with a B pitch leader, and an isometric view with C turns/hand. The A circle is a diameter reference, not the cut end of the bar. H01 is one continuous helix; P1/P2/P3 are its actual start, exact halfway and end stations. Display points are neither bend locations nor a cutting-length polyline.

Genuine Excel exports include a Helix Geometry sheet with full analytic parameters and formula-linked comparison values. Editing those references does not rewrite the captured Frozen BBS cut. BBS Print, BOQ and cutting demand use the selected cut once per occurrence. A3/A1 drawing and coordinate PDFs plus the A4 cutting schedule distinguish C turns from millimetres. Exports remain Draft / NOT FOR CONSTRUCTION. Native Excel printing has not been verified.

Application limits (not standard limits): 1,000 turns, 100 km centreline radius, 1,000 km axial height, 8,192 display segments per bar, and 200,000 stations across repeated bars. Display sagitta targets 0.1 mm; larger capped sagitta is disclosed and used in cover allowance. At least eight segments per turn are required; if a family cannot fit that budget, the display stays unavailable and the numeric analytic length remains available with a pending check. Split Marks rather than fabricating from an under-resolved picture. Long workbook display point arrays are explicitly omitted while full analytic parameters remain exported.

## Verification and remaining acceptance

See `output/helix-verification/DEVELOPMENT_REPORT.html` for synthetic local SDK, UI, export, formula, restoration and cutting evidence. These software checks do not accept the full original app. Remaining work includes shapes 33/51, complete BS/ACI rules, engineer-approved cases, real GULF/owner drawing acceptance, arbitrary assemblies, cumulative tolerance and production commissioning. Issued and production stock consumption remain closed. The user manages Rules and deployment; this increment does not change Rules, `.env`, Auth infrastructure or deploy Cloud changes.

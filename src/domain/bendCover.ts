// Cover policy `rebar-bend-tolerance-1.0` (fix/hook-cover, v0.114.2): the default cover check (`pathClearance` on the
// filleted centreline) allows a bent path to sit up to 0.001 mm closer than cover + bar radius. Generated 135° hooks and
// corner bends are filleted tangent to the cover line; rounding of the stored points (3 decimals) and the arc sampling put
// the arc 0.0001–0.0003 mm past it, which the legacy 0.0001 mm tolerance rejects. Straight paths keep the legacy check;
// the flat-end policy (`rebar-flat-ends-1.0`) is a separate choice and is not changed. Legacy specs / Frozen data keep
// their result: the policy is opt-in per spec and named in the engine version (`calculationEngine`).
import type {Spec} from './model';
export const BEND_COVER_POLICY='rebar-bend-tolerance-1.0';
/** Largest shortfall (mm) of cover + bar radius accepted on a bent path under `BEND_COVER_POLICY`. */
export const BEND_COVER_TOLERANCE=0.001;
/** Legacy tolerance inside `pathClearance` (`segmentFaceDistance < required − 0.0001` fails). */
const LEGACY_TOLERANCE=0.0001;
/** Amount to take off the required clearance of one path: the extra tolerance for bent paths under the policy, else 0. */
export const bendCoverSlack=(spec:Pick<Spec,'rebarCoverPolicy'>,path:readonly unknown[],radius:number)=>
 spec.rebarCoverPolicy===BEND_COVER_POLICY&&radius>0&&path.length>2?BEND_COVER_TOLERANCE-LEGACY_TOLERANCE:0;
/** Specs for new projects / new General Spec profiles get the policy unless they already chose one. */
export const withNewCoverPolicy=(spec:Spec):Spec=>spec.rebarCoverPolicy?spec:{...spec,rebarCoverPolicy:BEND_COVER_POLICY};

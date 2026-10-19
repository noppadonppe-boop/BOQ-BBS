import {CIRCULAR_PRISM_POLICY} from './circularProfile';
import {CODE99_REVIEW_POLICY} from './code99ReviewSchema';
import {PROJECT_MATERIAL_POLICY} from './projectMaterials';
import {FLAT_END_COVER_POLICY} from './flatEndCover';
import {PRISM_POLICY,INCLINED_PRISM_POLICY,TAPERED_PRISM_POLICY,supportsPrismPolicy} from './prismSchema';
import {BAR_PLACEMENT_POLICY} from './barPlacement';
// Bump whenever geometry, takeoff, centerline, rounding or mass calculations change.
export const ENGINE_VERSION='geometry-2.0';
// Analytic arc primitives are introduced by v5; older profiles keep their IDs.
export const CURVED_ENGINE_VERSION='geometry-2.1';
export const HELIX_ENGINE_VERSION='geometry-2.2';
import type {Spec,SnapshotBundle} from './model';
import {bsEnabled,bsProfile} from './bs8666';
import {EARTHWORK_POLICY} from './earthwork';
// Quantity policy has its own immutable engine ID; unchanged legacy geometry stays reproducible.
export const calculationEngine=(spec:Spec)=>(bsEnabled(spec)?(['bs8666-2000-v6','bs8666-2000-v7','bs8666-2000-v8'].includes(bsProfile(spec).id)?HELIX_ENGINE_VERSION:bsProfile(spec).id==='bs8666-2000-v5'?CURVED_ENGINE_VERSION:ENGINE_VERSION)+'+'+bsProfile(spec).id:ENGINE_VERSION)+(spec.projectMaterials?'+'+PROJECT_MATERIAL_POLICY:'')+(spec.earthworkPolicy===EARTHWORK_POLICY?'+'+EARTHWORK_POLICY:'')+(spec.barPlacementPolicy===BAR_PLACEMENT_POLICY?'+'+BAR_PLACEMENT_POLICY:'')+(spec.code99ReviewPolicy===CODE99_REVIEW_POLICY?'+'+CODE99_REVIEW_POLICY:'')+(spec.rebarCoverPolicy===FLAT_END_COVER_POLICY?'+'+FLAT_END_COVER_POLICY:'')+([PRISM_POLICY,INCLINED_PRISM_POLICY,TAPERED_PRISM_POLICY,CIRCULAR_PRISM_POLICY].includes(spec.concreteGeometryPolicy as typeof PRISM_POLICY)?'+'+spec.concreteGeometryPolicy:'');
export const supportsBundle=(b:SnapshotBundle)=>(b.project.spec.concreteGeometryPolicy!==CIRCULAR_PRISM_POLICY||!!b.engineVersion)&&(!b.project.spec.code99ReviewPolicy||b.project.spec.code99ReviewPolicy===CODE99_REVIEW_POLICY&&!!b.engineVersion)&&(!b.project.spec.rebarCoverPolicy||b.project.spec.rebarCoverPolicy===FLAT_END_COVER_POLICY&&!!b.engineVersion)&&((b.members||[]).every(m=>!m.prismGeometry||supportsPrismPolicy(b.project.spec.concreteGeometryPolicy,m.prismGeometry.version)))&&(!(b.members||[]).some(m=>m.bars.some(bar=>bar.placementLayout))||b.project.spec.barPlacementPolicy===BAR_PLACEMENT_POLICY)&&(!b.engineVersion||b.engineVersion===calculationEngine(b.project.spec));

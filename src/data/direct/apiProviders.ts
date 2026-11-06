import {doc,getDocFromServer,runTransaction} from 'firebase/firestore';
import {z} from 'zod';
import {db} from '../firebase';
import {apiProviderDefinitions,apiProviderIds,apiProvidersConfigPath,defaultApiProvidersConfig,defaultThinking,modelDefinition,thinkingKey,type ApiProviderId,type ApiProvidersConfig,type ApiThinkingSetting} from '../../domain/apiProviders';
import {profileMaster} from '../../domain/authAccess';
import {decodeStorage} from '../../domain/storageCodec';
import {actor,encode,must,now} from './common';
import {digestData} from '../snapshots';
import {APP_NAME} from '../../domain/auth';

const operationPath=`${APP_NAME}/root/apiProviderOperations`;
// SEC1: the API keys live in `apiProviderSecrets/{provider}` — written by MasterAdmin, never readable by a client (rules
// `allow read: if false`); the config keeps only `hasApiKey`. A key still found in the config (before SEC1) is moved there on
// the next save or by “ย้าย API Key ไปที่เก็บลับ” (`migrateApiProviderKeys`).
export const apiProviderSecretsPath=`${APP_NAME}/root/apiProviderSecrets`;
const secretRef=(provider:ApiProviderId)=>doc(db,apiProviderSecretsPath,provider);
const configRef=()=>doc(db,apiProvidersConfigPath);
const operationRef=(id:string)=>doc(db,operationPath,id);
const providerEnum=z.enum(['openai','anthropic','google-ai-studio']);
const thinkingInput=z.union([
 z.object({kind:z.literal('none')}),
 z.object({kind:z.literal('openai-reasoning-effort'),effort:z.enum(['none','minimal','low','medium','high','xhigh','max'])}),
 z.object({kind:z.literal('anthropic-adaptive-effort'),effort:z.enum(['low','medium','high','xhigh','max'])}),
 z.object({kind:z.literal('gemini-thinking-level'),level:z.enum(['minimal','low','medium','high'])}),
 z.object({kind:z.literal('gemini-thinking-budget'),budgetTokens:z.union([z.literal(-1),z.literal(0),z.literal(128),z.literal(512),z.literal(1024),z.literal(4096),z.literal(8192),z.literal(16384)])}),
 ]);
const providerInput=z.object({model:z.string().trim().min(1).max(120),thinking:thinkingInput,apiKey:z.string().max(500).optional(),clearApiKey:z.boolean().optional()});
const configInput=z.object({activeProvider:providerEnum.nullable(),providers:z.object({openai:providerInput,anthropic:providerInput,'google-ai-studio':providerInput})});

function baseConfig(raw?:any):ApiProvidersConfig{
 const defaults=defaultApiProvidersConfig(),source=raw&&typeof raw==='object'?decodeStorage(raw):{};
 const providers={...defaults.providers} as ApiProvidersConfig['providers'];
 for(const definition of apiProviderDefinitions){
  const value=source.providers?.[definition.id];
  if(value&&typeof value==='object'){
   const model=String(value.model||definition.models[0].id),modelInfo=modelDefinition(definition.id,model)||definition.models[0];
   const rawThinking=value.thinking as ApiThinkingSetting|undefined;
   const thinking=modelInfo.thinking.find(option=>rawThinking&&thinkingKey(option.setting)===thinkingKey(rawThinking))?.setting||modelInfo.thinking[0]?.setting||defaultThinking(definition.id,model);
   providers[definition.id]={model:modelInfo.id,thinking,...(value.apiKey?{apiKey:String(value.apiKey)}:{}),...(value.hasApiKey||value.apiKey?{hasApiKey:true}:{})};
  }
 }
 return {version:1,activeProvider:apiProviderIds.includes(source.activeProvider)?source.activeProvider:null,providers,updatedAt:typeof source.updatedAt==='string'?source.updatedAt:undefined,updatedBy:typeof source.updatedBy==='string'?source.updatedBy:undefined};
}

function publicConfig(config:ApiProvidersConfig):ApiProvidersConfig{
 const providers=Object.fromEntries(apiProviderDefinitions.map(definition=>{const value=config.providers[definition.id];return [definition.id,{model:value.model,thinking:value.thinking,hasApiKey:Boolean(value.hasApiKey||value.apiKey)}];})) as ApiProvidersConfig['providers'];
 return {...config,providers};
}

function validateModels(config:ApiProvidersConfig){
 for(const definition of apiProviderDefinitions){
  const setting=config.providers[definition.id],model=modelDefinition(definition.id,setting.model);
  must(Boolean(model),`${definition.name}: ไม่พบโมเดลที่เลือก`,'invalid-argument');
  must(Boolean(model?.thinking.some(option=>thinkingKey(option.setting)===thinkingKey(setting.thinking))),`${definition.name}: ระดับการคิดไม่รองรับกับโมเดลนี้`,'invalid-argument');
 }
}

export async function getDirectApiProviders(){
 const u=await actor();must(profileMaster(u),'เฉพาะ MasterAdmin เท่านั้น','permission-denied');
 const snapshot=await getDocFromServer(configRef());return publicConfig(snapshot.exists()?baseConfig(snapshot.data()):defaultApiProvidersConfig());
}

export async function getDirectActiveAiProvider(){
 await actor();
 const snapshot=await getDocFromServer(configRef()),config=publicConfig(snapshot.exists()?baseConfig(snapshot.data()):defaultApiProvidersConfig());
 const active=config.activeProvider;
 return {activeProvider:active,settings:active?config.providers[active]:null};
}

export async function saveDirectApiProviders(data:Record<string,any>,requestId:string){
  const parsed=configInput.parse(data.config),inputHash=await digestData({action:'saveApiProviders',data});
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u),'เฉพาะ MasterAdmin เท่านั้น','permission-denied');
  const ref=configRef(),or=operationRef(requestId),current=await tx.get(ref),operation=await tx.get(or);
  if(operation.exists()){const old=operation.data();must(old.uid===u.uid&&old.inputHash===inputHash,'รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว','aborted');return old.result;}
  const previous=baseConfig(current.exists()?current.data():undefined),providers={...previous.providers} as ApiProvidersConfig['providers'];
  const at=now();
  for(const definition of apiProviderDefinitions){
   const id=definition.id,input=parsed.providers[id],old=previous.providers[id],typed=input.apiKey?.trim();
   // new key → secret; cleared → secret emptied; a legacy key still in the config → moved to the secret
   if(input.clearApiKey)tx.set(secretRef(id),{apiKey:'',updatedAt:at,updatedBy:u.uid});
   else if(typed)tx.set(secretRef(id),{apiKey:typed,updatedAt:at,updatedBy:u.uid});
   else if(old.apiKey)tx.set(secretRef(id),{apiKey:old.apiKey,updatedAt:at,updatedBy:u.uid,migratedFromConfig:true});
   const has=input.clearApiKey?false:Boolean(typed||old.apiKey||old.hasApiKey);
   providers[id]={model:input.model,thinking:input.thinking as ApiThinkingSetting,hasApiKey:has};
  }
  const next:ApiProvidersConfig={version:1,activeProvider:parsed.activeProvider,providers,updatedAt:at,updatedBy:u.uid};
  validateModels(next);must(!next.activeProvider||Boolean(next.providers[next.activeProvider].hasApiKey),'ค่าย AI ที่ Active ต้องมี API Key','invalid-argument');
  const result=publicConfig(next);tx.set(ref,encode(withoutKeys(next)));tx.set(or,encode({id:requestId,uid:u.uid,inputHash,createdAt:at,result}));return result;
 });
}

export async function deleteDirectApiProvider(data:Record<string,any>,requestId:string){
 const provider=providerEnum.parse(data.provider) as ApiProviderId,inputHash=await digestData({action:'deleteApiProviderKey',data});
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u),'เฉพาะ MasterAdmin เท่านั้น','permission-denied');
  const ref=configRef(),or=operationRef(requestId),current=await tx.get(ref),operation=await tx.get(or);
  if(operation.exists()){const old=operation.data();must(old.uid===u.uid&&old.inputHash===inputHash,'รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว','aborted');return old.result;}
  const next=baseConfig(current.exists()?current.data():undefined);next.providers[provider]={model:next.providers[provider].model,thinking:next.providers[provider].thinking,hasApiKey:false};if(next.activeProvider===provider)next.activeProvider=null;next.updatedAt=now();next.updatedBy=u.uid;
  tx.set(secretRef(provider),{apiKey:'',updatedAt:next.updatedAt,updatedBy:u.uid});
  const result=publicConfig(next);tx.set(ref,encode(withoutKeys(next)));tx.set(or,encode({id:requestId,uid:u.uid,inputHash,createdAt:now(),result}));return result;
 });
}

/** The config as stored: no key fields (hasApiKey only). */
function withoutKeys(c:ApiProvidersConfig):ApiProvidersConfig{
 return {...c,providers:Object.fromEntries(apiProviderDefinitions.map(d=>{const v=c.providers[d.id];return [d.id,{model:v.model,thinking:v.thinking,hasApiKey:Boolean(v.hasApiKey||v.apiKey)}];})) as ApiProvidersConfig['providers']};
}
/** Keys still stored in the readable config (before SEC1)? */
export async function legacyApiKeysDirect():Promise<ApiProviderId[]>{
 const u=await actor();must(profileMaster(u),'เฉพาะ MasterAdmin เท่านั้น','permission-denied');
 const s=await getDocFromServer(configRef()),raw=s.exists()?decodeStorage(s.data()) as {providers?:Record<string,{apiKey?:string}>}:{};
 return apiProviderIds.filter(id=>Boolean(raw.providers?.[id]?.apiKey));
}
/** Moves every key still in the config to `apiProviderSecrets/{provider}` and removes it from the config (MasterAdmin). */
export async function migrateDirectApiProviderKeys(_data:Record<string,any>,requestId:string){
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u),'เฉพาะ MasterAdmin เท่านั้น','permission-denied');
  const ref=configRef(),or=operationRef(requestId),current=await tx.get(ref),operation=await tx.get(or);
  if(operation.exists())return operation.data().result;
  const cfg=baseConfig(current.exists()?current.data():undefined),at=now(),moved:ApiProviderId[]=[];
  for(const d of apiProviderDefinitions){const k=cfg.providers[d.id].apiKey;if(k){tx.set(secretRef(d.id),{apiKey:k,updatedAt:at,updatedBy:u.uid,migratedFromConfig:true});moved.push(d.id);}}
  const result={moved};tx.set(ref,encode({...withoutKeys(cfg),updatedAt:at,updatedBy:u.uid}));tx.set(or,encode({id:requestId,uid:u.uid,inputHash:'migrate',createdAt:at,result}));return result;
 });
}

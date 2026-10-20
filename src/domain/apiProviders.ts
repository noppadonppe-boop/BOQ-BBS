import {APP_NAME} from './auth';

export type ApiProviderId='openai'|'anthropic'|'google-ai-studio';
export type OpenAiReasoningEffort='none'|'minimal'|'low'|'medium'|'high'|'xhigh'|'max';
export type AnthropicEffort='low'|'medium'|'high'|'xhigh'|'max';
export type GeminiThinkingLevel='minimal'|'low'|'medium'|'high';

export type ApiThinkingSetting=
 | {kind:'none'}
 | {kind:'openai-reasoning-effort';effort:OpenAiReasoningEffort}
 | {kind:'anthropic-adaptive-effort';effort:AnthropicEffort}
 | {kind:'gemini-thinking-level';level:GeminiThinkingLevel}
 | {kind:'gemini-thinking-budget';budgetTokens:-1|0|128|512|1024|4096|8192|16384};

export type ApiThinkingOption={value:string;label:string;description:string;setting:ApiThinkingSetting};
export type ApiModelDefinition={id:string;label:string;thinking:readonly ApiThinkingOption[]};
export type ApiProviderDefinition={id:ApiProviderId;name:string;description:string;thinkingParameter:string;models:readonly ApiModelDefinition[]};

const openAiOptions=(efforts:readonly OpenAiReasoningEffort[]):ApiThinkingOption[]=>efforts.map(effort=>({value:effort,label:effort==='none'?'ไม่มี reasoning':effort,description:`Responses API · reasoning.effort = ${effort}`,setting:{kind:'openai-reasoning-effort',effort}}));
const anthropicOptions=(efforts:readonly AnthropicEffort[]):ApiThinkingOption[]=>efforts.map(effort=>({value:effort,label:effort,description:`Messages API · thinking = adaptive · output_config.effort = ${effort}`,setting:{kind:'anthropic-adaptive-effort',effort}}));
const geminiLevelOptions=(levels:readonly GeminiThinkingLevel[]):ApiThinkingOption[]=>levels.map(level=>({value:level,label:level,description:`Generate Content API · thinkingConfig.thinkingLevel = ${level}`,setting:{kind:'gemini-thinking-level',level}}));
const geminiBudgetOptions=(budgets:readonly (-1|0|128|512|1024|4096|8192|16384)[]):ApiThinkingOption[]=>budgets.map(budgetTokens=>({value:String(budgetTokens),label:budgetTokens===-1?'Dynamic':budgetTokens===0?'ปิดการคิด':`${budgetTokens.toLocaleString()} tokens`,description:`Generate Content API · thinkingConfig.thinkingBudget = ${budgetTokens}`,setting:{kind:'gemini-thinking-budget',budgetTokens}}));

const openAiModel=(id:string,label:string,efforts:readonly OpenAiReasoningEffort[]):ApiModelDefinition=>({id,label,thinking:openAiOptions(efforts)});
const anthropicModel=(id:string,label:string,efforts:readonly AnthropicEffort[]):ApiModelDefinition=>({id,label,thinking:anthropicOptions(efforts)});
const geminiLevelModel=(id:string,label:string,levels:readonly GeminiThinkingLevel[]):ApiModelDefinition=>({id,label,thinking:geminiLevelOptions(levels)});
const geminiBudgetModel=(id:string,label:string,budgets:readonly (-1|0|128|512|1024|4096|8192|16384)[]):ApiModelDefinition=>({id,label,thinking:geminiBudgetOptions(budgets)});

export const apiProviderDefinitions:readonly ApiProviderDefinition[]=[
 {id:'openai',name:'OpenAI',description:'Responses API · reasoning effort ของ OpenAI',thinkingParameter:'reasoning.effort',models:[
  openAiModel('gpt-6-astra','GPT-6 Astra',['low','medium','high','xhigh','max']),openAiModel('gpt-6.1-sol','GPT-6.1 Sol',['low','medium','high','xhigh','max']),openAiModel('gpt-6-sol','GPT-6 Sol',['none','low','medium','high','xhigh','max']),openAiModel('gpt-6-luna','GPT-6 Luna',['none','low','medium','high','xhigh','max']),openAiModel('gpt-5.6-sol','GPT-5.6 Sol',['none','low','medium','high','xhigh','max']),openAiModel('gpt-5.5-pro','GPT-5.5 Pro',['medium','high','xhigh']),
 ]},
 {id:'anthropic',name:'Anthropic',description:'Messages API · adaptive thinking และ effort ของ Claude',thinkingParameter:'thinking + output_config.effort',models:[
  anthropicModel('claude-fable-5-1','Claude Fable 5.1',['low','medium','high','xhigh','max']),anthropicModel('claude-opus-5-5','Claude Opus 5.5',['low','medium','high','xhigh','max']),anthropicModel('claude-sonnet-5-5','Claude Sonnet 5.5',['low','medium','high','xhigh','max']),anthropicModel('claude-haiku-5-5','Claude Haiku 5.5',['low','medium','high','xhigh','max']),
 ]},
 {id:'google-ai-studio',name:'Google AI Studio',description:'Generate Content API · Gemini thinking level',thinkingParameter:'generationConfig.thinkingConfig.thinkingLevel',models:[
  geminiLevelModel('gemini-4-argon','Gemini 4 Argon',['low','medium','high']),geminiLevelModel('gemini-3.8-flash','Gemini 3.8 Flash',['low','medium','high']),geminiLevelModel('gemini-3.6-flash','Gemini 3.6 Flash',['minimal','low','medium','high']),geminiLevelModel('gemini-3.5-flash-lite','Gemini 3.5 Flash-Lite',['minimal','low','medium','high']),geminiLevelModel('gemini-3.1-flash-lite','Gemini 3.1 Flash-Lite',['minimal','low','medium','high']),geminiLevelModel('gemini-3.1-pro-preview','Gemini 3.1 Pro Preview',['low','medium','high']),geminiLevelModel('gemini-3-flash-preview','Gemini 3 Flash Preview',['minimal','low','medium','high']),
 ]},
];

export const apiProviderIds=apiProviderDefinitions.map(provider=>provider.id) as ApiProviderId[];
export type ApiProviderSettings={model:string;thinking:ApiThinkingSetting;apiKey?:string;hasApiKey?:boolean};
export type ApiProvidersConfig={version:1;activeProvider:ApiProviderId|null;providers:Record<ApiProviderId,ApiProviderSettings>;updatedAt?:string;updatedBy?:string};
export const apiProvidersConfigPath=`${APP_NAME}/root/apiProviders/config`;
export const modelDefinition=(provider:ApiProviderId,model:string)=>apiProviderDefinitions.find(item=>item.id===provider)?.models.find(item=>item.id===model);
export const defaultThinking=(provider:ApiProviderId,model:string):ApiThinkingSetting=>modelDefinition(provider,model)?.thinking[0]?.setting||{kind:'none'};
export const thinkingKey=(setting:ApiThinkingSetting)=>JSON.stringify(setting);
export const defaultApiProvidersConfig=():ApiProvidersConfig=>({version:1,activeProvider:null,providers:Object.fromEntries(apiProviderDefinitions.map(provider=>[provider.id,{model:provider.models[0].id,thinking:provider.models[0].thinking[0].setting}])) as Record<ApiProviderId,ApiProviderSettings>});


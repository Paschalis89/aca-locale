import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiCoreReadiness } from './ai-core-readiness.ts';

const config = {translationProvider:'DEEPL',translationModel:'',fallbackProvider:'OPENAI',fallbackModel:'gpt-6-luna',reviewProvider:'ANTHROPIC',reviewModel:'claude-sonnet-5-5'};
const healthy = [{provider:'DEEPL',status:'OK'},{provider:'OPENAI',status:'OK'},{provider:'ANTHROPIC',status:'OK'}];
const budget = {monthlyBudgetUsd:20,incomplete:false,unpricedEvents:0,unknownUsageEvents:0};
const run = (overrides={})=>createAiCoreReadiness({config,providerHealth:healthy,budget,...overrides});

test('read-only contract never enables remote execution or fallback',()=>{
  const result=run();
  assert.equal(result.status,'NOT_CONNECTED');
  assert.equal(result.contract.executionEnabled,false);
  assert.equal(result.contract.automaticFallbackEnabled,false);
  assert.equal(result.contract.mode,'LOCAL_ONLY');
});
test('normalizes provider names and keeps stages separate',()=>{
  const result=run({config:{...config, translationProvider:' deepl '}});
  assert.deepEqual(result.contract.routes.map(x=>`${x.role}:${x.provider}`),['PRIMARY:DEEPL','FALLBACK:OPENAI','REVIEW:ANTHROPIC']);
});
test('DeepL does not need a model; LLM does',()=>{
  const result=run({config:{...config,fallbackModel:''}});
  assert.equal(result.findings.filter(x=>x.code==='MISSING_MODEL').length,1);
});
test('health snapshots missing are not treated as success',()=>{
  assert.ok(run({providerHealth:null}).findings.some(x=>x.code==='HEALTH_NOT_CHECKED'));
  assert.ok(run({providerHealth:[]}).findings.some(x=>x.code==='PROVIDER_NOT_VERIFIED'));
});
test('duplicate fallback is warned against, not enabled',()=>{
  const result=run({config:{...config,fallbackProvider:'DEEPL',fallbackModel:''}});
  assert.ok(result.findings.some(x=>x.code==='DUPLICATE_FALLBACK'));
  assert.equal(result.contract.automaticFallbackEnabled,false);
});
test('incomplete spend remains clearly advisory',()=>{
  const result=run({budget:{...budget,incomplete:true,unpricedEvents:27,unknownUsageEvents:1}});
  assert.ok(result.findings.some(x=>x.code==='INCOMPLETE_COSTS'));
  assert.equal(result.contract.safeguards.noHistoricalLedgerMutation,true);
});
test('preview never serializes secrets or prompts',()=>{
  const result=run();
  const output=JSON.stringify(result.contract);
  for (const forbidden of ['apiKey','apiSecret','prompt','token','shop']) assert.equal(output.includes(forbidden),false);
});

import {randomUUID} from 'node:crypto';

export function fault(status,category,message){
 return Object.assign(new Error(message),{status,category,publicMessage:message});
}
const categories=new Set(['configuration_origin','configuration_database','configuration_certificate','database_role','feature_unavailable']);
const connectionFailures=new WeakSet();
export function connectionFailure(error){
 if(error&&typeof error==='object')connectionFailures.add(error);
 return error;
}
const codes={
 '28P01':['database_authentication',503],'28000':['database_authentication',503],
 ECONNREFUSED:['database_connection',503],ECONNRESET:['database_connection',503],ENOTFOUND:['database_connection',503],ETIMEDOUT:['database_connection',503],
 '57P01':['database_connection',503],'53300':['database_connection',503],
 SELF_SIGNED_CERT_IN_CHAIN:['database_tls',503],DEPTH_ZERO_SELF_SIGNED_CERT:['database_tls',503],UNABLE_TO_VERIFY_LEAF_SIGNATURE:['database_tls',503],UNABLE_TO_GET_ISSUER_CERT_LOCALLY:['database_tls',503],ERR_TLS_CERT_ALTNAME_INVALID:['database_tls',503],CERT_HAS_EXPIRED:['database_tls',503],
 '42501':['database_permissions',403],'23505':['conflict',409],'23514':['conflict',409],'23503':['conflict',409],'22P02':['request_validation',400],
 '57014':['database_timeout',503],'55P03':['database_timeout',503]
};
const messages={400:'Invalid request',401:'Authentication required',403:'Access denied',404:'Route unavailable',409:'Constraint or revision conflict',413:'Request too large',415:'JSON required',429:'Too many attempts',500:'Server operation failed',503:'Service temporarily unavailable'};
export function failure(error){
 if(categories.has(error?.category))return {status:error.status,category:error.category,code:error.category==='database_role'?'RUNTIME_ROLE':'CONFIGURATION',message:error.publicMessage};
 const mapped=typeof error?.code==='string'&&Object.hasOwn(codes,error.code)?codes[error.code]:undefined;
 if(mapped)return {status:mapped[1],category:mapped[0],code:error.code,message:messages[mapped[1]]};
 if(error&&typeof error==='object'&&connectionFailures.has(error))return {status:503,category:'database_connection',code:'UNCLASSIFIED',message:messages[503]};
 const status=[400,401,403,404,409,413,415,429].includes(error?.status)?error.status:500;
 const category=status===401?'authentication':status===403?'authorization':status===409?'conflict':status===429?'rate_limit':status<500?'request_validation':'internal';
 return {status,category,code:'APPLICATION',message:error?.publicMessage&&status<500?error.publicMessage:messages[status]};
}
export const requestId=()=>randomUUID();
// Deliberately exclude exception messages/stacks, SQL, URLs, headers and payloads.
export function logFailure(error,{id=requestId(),route='operator',stage='operation',method='SYSTEM',event='rimdan_failure'}={}){
 const detail=failure(error);
 console.error(JSON.stringify({event,requestId:id,route,stage,method,category:detail.category,code:detail.code}));
 return detail;
}

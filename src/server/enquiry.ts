import {createHash} from 'node:crypto';
import {put,get} from '@vercel/blob';

export type Project='luxury-realty'|'atlantis'|'orla'|'six-senses'|'ava-at-palm';
export type Enquiry={
 project:Project;context:string;name:string;email:string;phone:string;message:string;
 consent:true;submissionId:string;startedAt:number;
};
type RecordValue={version:1;id:string;receivedAt:string;fingerprint:string;enquiry:Omit<Enquiry,'startedAt'>};
export type EnquiryStore={write:(path:string,value:RecordValue)=>Promise<void>;read:(path:string)=>Promise<RecordValue|null>};
const MAX_BODY=16_384;
const MAX_AGE=7*24*60*60*1000;
const buckets=new Map<string,{count:number;expires:number}>();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const response=(status:number,value:object,extra:Record<string,string>={})=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}
});
const clean=(value:unknown,max:number,multiline=false)=>typeof value==='string'
 ?value.trim().replace(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g:/[\u0000-\u001f\u007f]/g,'').slice(0,max+1):'';

export function validateEnquiry(input:unknown,project:Project,now=Date.now()):{value?:Enquiry;fields:Record<string,string>;error?:string}{
 const fields:Record<string,string>={};
 if(!input||typeof input!=='object'||Array.isArray(input))return{fields,error:'Please submit a valid enquiry.'};
 const data=input as Record<string,unknown>;
 const name=clean(data.name,100),email=clean(data.email,254).toLowerCase(),phone=clean(data.phone,30);
 const message=clean(data.message,2000,true),context=clean(data.context,200)||'Website enquiry';
 if(data.project!==project)return{fields,error:'This enquiry is for a different project. Please reload the page.'};
 if(typeof data.website==='string'&&data.website.trim())return{fields,error:'Your enquiry could not be accepted. Please contact the team directly.'};
 if(name.length<2||name.length>100)fields.name='Enter a name between 2 and 100 characters.';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fields.email='Enter a valid email address.';
 if(phone&&!/^[+\d()\s.-]{6,30}$/.test(phone))fields.phone='Enter a valid phone number, including the country code.';
 if(data.consent!==true)fields.consent='Please confirm consent before sending your enquiry.';
 if(message.length>2000)fields.message='Keep your message under 2,000 characters.';
 if(context.length>200)fields.context='The enquiry context is too long.';
 if(typeof data.submissionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.submissionId))return{fields,error:'Please reload the form before submitting.'};
 if(typeof data.startedAt!=='number'||!Number.isFinite(data.startedAt)||data.startedAt>now+30_000||now-data.startedAt>MAX_AGE)return{fields,error:'This form has expired. Please reopen it and try again.'};
 if(now-data.startedAt<600)return{fields,error:'Please take a moment to check your details, then try again.'};
 if(Object.keys(fields).length)return{fields,error:'Please check the highlighted fields.'};
 return{fields,value:{project,context,name,email,phone,message,consent:true,submissionId:data.submissionId.toLowerCase(),startedAt:data.startedAt}};
}

const blobStore:EnquiryStore={
 async write(path,value){await put(path,JSON.stringify(value),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60,abortSignal:AbortSignal.timeout(12000)});},
 async read(path){
  const result=await get(path,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(8000)});
  if(!result||result.statusCode!==200)return null;
  return await new Response(result.stream).json() as RecordValue;
 }
};

async function boundedBody(request:Request){
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>MAX_BODY)throw new RangeError('body');
 if(!request.body)return '';
 const reader=request.body.getReader();const decoder=new TextDecoder();let total=0;let text='';
 try{
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY){await reader.cancel();throw new RangeError('body');}text+=decoder.decode(value,{stream:true});}
  return text+decoder.decode();
 }finally{reader.releaseLock();}
}

export async function handleEnquiry(request:Request,project:Project,options:{store?:EnquiryStore;now?:number;clientAddress?:string;configured?:boolean}={}){
 if(request.method!=='POST')return response(405,{error:'Use POST to submit an enquiry.'},{Allow:'POST'});
 const origin=request.headers.get('origin');
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return response(403,{error:'Please submit the enquiry from this website.'});
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response(415,{error:'Please submit the enquiry using the website form.'});
 let input:unknown;
 try{input=JSON.parse(await boundedBody(request));}catch(error){return response(error instanceof RangeError?413:400,{error:error instanceof RangeError?'Your enquiry is too large. Please shorten the message.':'Your enquiry could not be read. Please try again.'});}
 const now=options.now??Date.now();
 const result=validateEnquiry(input,project,now);
 if(!result.value)return response(422,{error:result.error,fields:result.fields});
 const enquiry=result.value;
 const configured=options.configured??Boolean(process.env.BLOB_READ_WRITE_TOKEN||(process.env.BLOB_STORE_ID&&process.env.VERCEL_OIDC_TOKEN));
 if(!configured&&!options.store)return response(503,{error:'Enquiries are temporarily unavailable. Please try again or use the contact details on this website.'},{'Retry-After':'60'});
 // This is a bounded per-instance abuse check, in addition to the hosting firewall.
 // No raw address or request body is written to logs.
 const address=options.clientAddress||request.headers.get('x-real-ip')||'unknown';
 const key=hash(address+'|'+new Date(now).toISOString().slice(0,10));
 if(buckets.size>2000)for(const [k,bucket]of buckets)if(bucket.expires<now)buckets.delete(k);
 if(buckets.size>5000)buckets.delete(buckets.keys().next().value!);
 const bucket=buckets.get(key);
 if(bucket&&bucket.expires>now&&bucket.count>=20)return response(429,{error:'There have been several enquiries from this connection. Please try again in a few minutes.'},{'Retry-After':String(Math.ceil((bucket.expires-now)/1000))});
 if(!bucket||bucket.expires<=now)buckets.set(key,{count:1,expires:now+15*60*1000});else bucket.count++;
 const {startedAt:_,...storedEnquiry}=enquiry;
 const fingerprint=hash(JSON.stringify(storedEnquiry));
 const id=enquiry.submissionId;
 const path='enquiries/'+project+'/'+id+'.json';
 const value:RecordValue={version:1,id,receivedAt:new Date(now).toISOString(),fingerprint,enquiry:storedEnquiry};
 const store=options.store||blobStore;
 try{
  await store.write(path,value);
  return response(201,{ok:true,id});
 }catch{
  // A timed-out write may already have reached storage. Read it before declaring failure.
  // An existing key never overwrites an earlier enquiry.
  try{
   const existing=await store.read(path);
   if(existing?.id===id){
    if(existing.fingerprint===fingerprint)return response(200,{ok:true,id});
    return response(409,{error:'This enquiry reference was already used. Please reopen the form to send a new enquiry.'});
   }
  }catch{/* Storage errors deliberately contain no customer data in the response or logs. */}
  return response(503,{error:'Your enquiry could not be confirmed. Please retry; your details have been kept in the form.'},{'Retry-After':'30'});
 }
}

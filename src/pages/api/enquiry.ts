import type {APIRoute} from 'astro';
import {handleEnquiry} from '../../server/enquiry';
export const prerender=false;
export const POST:APIRoute=({request,clientAddress})=>handleEnquiry(request,'ava-at-palm',{clientAddress});
export const ALL:APIRoute=()=>new Response(JSON.stringify({error:'Use POST to submit an enquiry.'}),{status:405,headers:{Allow:'POST','Content-Type':'application/json','Cache-Control':'no-store'}});

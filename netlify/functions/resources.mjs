const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type,x-admin-password","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
const validLabs=new Set(['pharmacology','technology','natural-drug','biotechnology','chemistry']);
function config(){const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Shared database is not configured. The site owner must follow SETUP.md.');return {url:url.replace(/\/$/,''),key}}
async function sb(path,options={}){const c=config();return fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}})}
export default async(req)=>{
 if(req.method==='OPTIONS')return new Response('',{status:204,headers});
 try{
  if(req.method==='GET'){
   const r=await sb('lab_resources?select=id,lab,title,summary,image_url,questions,created_at&order=created_at.desc&limit=300');const d=await r.json();if(!r.ok)return reply(502,{error:'Could not load shared resources. Check the database setup.'});return reply(200,{resources:d});
  }
  if(req.method!=='POST')return reply(405,{error:'Method not allowed.'});
  const admin=process.env.ADMIN_PASSWORD;if(!admin)return reply(503,{error:'Publishing is not configured. Site owner must set ADMIN_PASSWORD.'});
  if(!req.headers.get('x-admin-password')||req.headers.get('x-admin-password')!==admin)return reply(401,{error:'Publisher password is incorrect.'});
  const body=await req.json();if(!validLabs.has(body.lab))return reply(400,{error:'Choose a valid lab.'});if(!String(body.title||'').trim())return reply(400,{error:'A title is required.'});
  let imageUrl=null;
  if(body.image&&typeof body.image==='string'&&body.image.startsWith('data:image/')){
    const m=body.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/);if(!m)return reply(400,{error:'Image must be JPG, PNG or WebP.'});if(body.image.length>7_500_000)return reply(413,{error:'Image is too large. Resize it and try again.'});
    const ext=m[1]==='image/jpeg'?'jpg':m[1].split('/')[1];const path=`${body.lab}/${Date.now()}-${crypto.randomUUID()}.${ext}`;const c=config();const upload=await fetch(`${c.url}/storage/v1/object/lablens-images/${path}`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':m[1],'x-upsert':'false'},body:Buffer.from(m[2],'base64')});if(!upload.ok)return reply(502,{error:'Image upload failed. Check that the public lablens-images storage bucket exists.'});imageUrl=`${c.url}/storage/v1/object/public/lablens-images/${path}`;
  }
  const questions=Array.isArray(body.questions)?body.questions.slice(0,10).map(q=>({question:String(q.question||'').slice(0,2000),options:Array.isArray(q.options)?q.options.slice(0,4).map(v=>String(v).slice(0,500)):[],correct_index:Math.max(0,Math.min(3,Number(q.correctIndex??q.correct_index)||0)),explanation:String(q.explanation||'').slice(0,3000)})).filter(q=>q.question&&q.options.length===4):[];
  const payload={lab:body.lab,title:String(body.title).trim().slice(0,240),summary:String(body.summary||'').slice(0,15000),image_url:imageUrl,questions};const r=await sb('lab_resources',{method:'POST',body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)return reply(502,{error:'Could not save the shared resource. Check the table setup.'});return reply(201,{resource:d[0]||null});
 }catch(e){return reply(503,{error:e.message||'Shared resources are temporarily unavailable.'})}
};

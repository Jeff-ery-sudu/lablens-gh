const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
export default async (req)=>{
  if(req.method==='OPTIONS')return new Response('',{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'Use POST for image analysis.'});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return reply(503,{error:'AI is not configured yet. The site owner must add GEMINI_API_KEY in Netlify environment variables.'});
  try{
    const body=await req.json();const {lab,topic,instructions,image}=body||{};
    if(!image||typeof image!=='string'||!image.startsWith('data:image/'))return reply(400,{error:'Upload an image first.'});
    if(image.length>7_500_000)return reply(413,{error:'Image is too large. Resize it and try again.'});
    const match=image.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/);
    if(!match)return reply(400,{error:'Use a JPG, PNG or WebP image.'});
    const prompt=`You are an educational assistant helping a pharmacy student prepare for a practical laboratory quiz. Lab: ${String(lab||'').slice(0,100)}. Topic provided by student: ${String(topic||'').slice(0,500)}. Extra instructions: ${String(instructions||'').slice(0,1000)}.\nStudy the uploaded image carefully. Do not claim certainty when the image does not support identification. If it is a specimen, do not over-identify it from an unclear image. Create an educational draft that the student MUST verify against their official lab manual. Do not invent observations or measurements. If information is not visible, say so. Return ONLY JSON with this schema: {"title":"short title","summary":"clear explanation of what the practical is about, what is visible, key visual clues, principle or purpose if supported, relevant precautions and what a student should remember; distinguish image observations from general background","questions":[{"question":"MCQ question","options":["option A","option B","option C","option D"],"correctIndex":0,"explanation":"why the answer is correct and why the concept matters"}]}. Generate 5 relevant MCQs, from recall to application. Every question must have exactly four plausible options and exactly one best answer. Do not provide patient-specific diagnosis or treatment. If the image is not interpretable, explain the limitation and ask for a clearer image in summary; make questions about safe image interpretation rather than guessing.`;
    const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:match[1],data:match[2]}}]}],generationConfig:{responseMimeType:'application/json',temperature:0.25}})});
    const data=await response.json();if(!response.ok)return reply(502,{error:data?.error?.message||'The AI service could not analyse this image. Try again later.'});
    const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');if(!text)return reply(502,{error:'The AI returned no text. Try a clearer image.'});
    let result;try{result=JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))}catch{return reply(502,{error:'The AI response was not valid JSON. Please try again.'})}
    if(!Array.isArray(result.questions))result.questions=[];
    result.questions=result.questions.slice(0,8).map(q=>({question:String(q.question||''),options:Array.isArray(q.options)?q.options.slice(0,4).map(String):[],correctIndex:Math.max(0,Math.min(3,Number(q.correctIndex)||0)),explanation:String(q.explanation||'')})).filter(q=>q.question&&q.options.length===4);
    return reply(200,{title:String(result.title||topic||'Lab practical'),summary:String(result.summary||''),questions:result.questions,disclaimer:'AI-generated draft: verify against your official lab manual.'});
  }catch(e){return reply(500,{error:'Could not process this request. Please try again.'})}
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sceneDescriptions, jobId } = await req.json();
    
    if (!Array.isArray(sceneDescriptions) || sceneDescriptions.length === 0) {
      throw new Error("sceneDescriptions must be a non-empty array");
    }

    console.log("Generating images for", sceneDescriptions.length, "scenes");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Import Supabase client for progress updates
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update job status to processing
    if (jobId) {
      await supabase
        .from('video_generation_jobs')
        .update({ 
          status: 'processing',
          current_step: 'Generating scene images',
          total_scenes: sceneDescriptions.length,
          progress: 0
        })
        .eq('id', jobId);
    }

    // Generate images for each scene sequentially to avoid rate limits
    const images = [];
    
    for (let index = 0; index < sceneDescriptions.length; index++) {
      const description = sceneDescriptions[index];
      console.log(`Generating image ${index + 1}/${sceneDescriptions.length}`);
      
      // Update progress
      if (jobId) {
        const progress = Math.round(((index + 1) / sceneDescriptions.length) * 50);
        await supabase
          .from('video_generation_jobs')
          .update({ 
            completed_scenes: index + 1,
            progress: progress,
            current_step: `Generating image ${index + 1}/${sceneDescriptions.length}`
          })
          .eq('id', jobId);
      }
      
      // Retry logic with exponential backoff
      let retries = 3;
      let imageUrl = null;
      
      while (retries > 0 && !imageUrl) {
        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image-preview",
              messages: [
                {
                  role: "user",
                  content: `Generate a high-quality, professional image for a YouTube video scene: ${description}`
                }
              ],
              modalities: ["image", "text"]
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("AI gateway error:", response.status, errorText);
            
            // Handle rate limiting
            if (response.status === 429) {
              retries--;
              if (retries > 0) {
                const waitTime = (4 - retries) * 2000; // 2s, 4s, 6s
                console.log(`Rate limited. Waiting ${waitTime}ms before retry ${4 - retries}/3`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
              } else {
                throw new Error("Rate limit exceeded. Please try again in a few moments or upgrade your plan for higher limits.");
              }
            }
            
            throw new Error(`AI gateway error: ${errorText}`);
          }

          const data = await response.json();
          console.log(`Image ${index + 1} response:`, JSON.stringify(data).substring(0, 200));
          
          imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          
          if (!imageUrl) {
            console.error("No image in response for scene:", description);
            console.error("Full response:", JSON.stringify(data));
            throw new Error("No image generated - check if prompt is valid");
          }
          
          images.push({
            sceneIndex: index,
            imageUrl: imageUrl
          });
          
          // Add a small delay between successful requests to avoid rate limits
          if (index < sceneDescriptions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error) {
          if (retries === 1) {
            throw error;
          }
          retries--;
          const waitTime = (4 - retries) * 2000;
          console.log(`Error generating image. Waiting ${waitTime}ms before retry ${4 - retries}/3`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.log("Successfully generated all images");

    // Update job progress
    if (jobId) {
      await supabase
        .from('video_generation_jobs')
        .update({ 
          progress: 50,
          current_step: 'Images generated, preparing video assembly'
        })
        .eq('id', jobId);
    }

    return new Response(
      JSON.stringify({ images }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-scene-images function:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    let status = 500;
    let clientMessage = message;

    // Surface payment/credits and rate limit errors explicitly
    if (message.includes("payment_required") || message.includes("Payment required")) {
      status = 402;
      clientMessage = "Payment required. Not enough AI credits in your workspace.";
    } else if (message.includes("rate_limited") || message.includes("429")) {
      status = 429;
      clientMessage = "Rate limit exceeded. Please wait a bit and try again.";
    }

    return new Response(
      JSON.stringify({ error: clientMessage }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

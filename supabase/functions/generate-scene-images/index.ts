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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
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
          const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-image-1",
              prompt: `Generate a high-quality, professional image for a YouTube video scene: ${description}`,
              n: 1,
              size: "1024x1024",
              quality: "high",
              response_format: "b64_json"
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API error:", response.status, errorText);
            
            // Handle rate limiting
            if (response.status === 429) {
              retries--;
              if (retries > 0) {
                const waitTime = (4 - retries) * 2000; // 2s, 4s, 6s
                console.log(`Rate limited. Waiting ${waitTime}ms before retry ${4 - retries}/3`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
              } else {
                throw new Error("OpenAI rate limit exceeded. Please try again in a few moments.");
              }
            }
            
            throw new Error(`OpenAI API error: ${errorText}`);
          }

          const data = await response.json();
          const base64Image = data.data?.[0]?.b64_json;
          
          if (!base64Image) {
            console.error("No image in response:", JSON.stringify(data).substring(0, 500));
            throw new Error("No image generated from OpenAI");
          }

          imageUrl = `data:image/png;base64,${base64Image}`;
          console.log(`Successfully generated image ${index + 1}`);
          break;
        } catch (error) {
          retries--;
          console.error(`Error generating image (${retries} retries left):`, error);
          
          if (retries === 0) {
            // If we're out of retries and this is due to payment/credits issue, return error response
            if (error instanceof Error && (error.message.includes("402") || error.message.includes("credits"))) {
              if (jobId) {
                await supabase
                  .from('video_generation_jobs')
                  .update({ 
                    status: 'failed',
                    error_message: 'OpenAI API error: Payment required. Please check your OpenAI account.'
                  })
                  .eq('id', jobId);
              }
              
              return new Response(
                JSON.stringify({
                  error: "OpenAI API error: Payment required. Please check your OpenAI account.",
                  statusCode: 402,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            throw error;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!imageUrl) {
        throw new Error("Failed to generate image after retries");
      }
      
      images.push(imageUrl);
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
    let statusCode = 500;
    let clientMessage = message;

    // Surface payment/credits and rate limit errors explicitly in the body,
    // but always respond with HTTP 200 so the frontend can gracefully
    // handle fallbacks without causing a runtime error overlay.
    if (message.includes("payment_required") || message.includes("Payment required")) {
      statusCode = 402;
      clientMessage = "Payment required. Not enough AI credits in your workspace.";
    } else if (message.includes("rate_limited") || message.includes("429")) {
      statusCode = 429;
      clientMessage = "Rate limit exceeded. Please wait a bit and try again.";
    }

    return new Response(
      JSON.stringify({ error: clientMessage, statusCode }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

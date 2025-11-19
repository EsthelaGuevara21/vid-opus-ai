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
    const { topic, videoLength, style, targetAudience } = await req.json();
    
    console.log("Generating video content for:", { topic, videoLength, style, targetAudience });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create a comprehensive system prompt for video production
    const systemPrompt = `You are a specialized YouTube video production AI. Generate complete, engaging video content that includes:

1. FULL SCRIPT with timestamps
2. DETAILED VISUAL DESCRIPTIONS for each scene (for stock footage or AI generation)
3. BACKGROUND MUSIC RECOMMENDATIONS with specific genres and moods
4. THUMBNAIL CONCEPT with detailed visual description

Make the content highly engaging, professional, and optimized for YouTube's algorithm. Include hooks, storytelling elements, and calls-to-action.`;

    const userPrompt = `Create a complete YouTube video production package for:

Topic: ${topic}
Video Length: ${videoLength}
Style: ${style}
Target Audience: ${targetAudience}

CRITICAL: You MUST use these EXACT section headers without any modifications, numbers, or extra words:

## SCRIPT
[Provide a complete, engaging script with timestamps. Include intro hook, main content sections, transitions, and outro with CTA. Mark timestamps as [00:00], [01:30], etc.]

## VISUAL SCENES
[For each major scene/timestamp, describe in detail what visuals should appear. Be specific about camera angles, settings, graphics, text overlays, B-roll suggestions, etc.]

## MUSIC RECOMMENDATIONS
[Suggest 3-5 specific background music tracks with genre, mood, tempo, and when to use them in the video. Include links to royalty-free music sources if possible.]

## THUMBNAIL CONCEPT
[Provide a detailed thumbnail design description including: main visual elements, text overlay, colors, facial expressions (if applicable), and composition. Make it click-worthy and YouTube algorithm-friendly.]

Make everything professional, engaging, and production-ready.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        // Rate limit error: surface in body but keep HTTP 200 to avoid runtime overlay
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again later.",
            statusCode: 429,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        // Credits/payment error: surface in body but keep HTTP 200 to avoid runtime overlay
        return new Response(
          JSON.stringify({
            error: "Payment required. Please add credits to your workspace.",
            statusCode: 402,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${errorText}`);
    }

    // Read response as text first to debug potential issues
    const responseText = await response.text();
    console.log("Response length:", responseText.length);
    console.log("Response preview:", responseText.substring(0, 200));
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JSON response");
      console.error("Parse error:", parseError);
      console.error("Response text (first 1000 chars):", responseText.substring(0, 1000));
      throw new Error("Invalid JSON response from AI gateway");
    }

    const generatedContent = data.choices?.[0]?.message?.content;
    
    if (!generatedContent) {
      console.error("No content in response:", JSON.stringify(data).substring(0, 500));
      throw new Error("No content generated from AI");
    }

    console.log("Successfully generated video content, length:", generatedContent.length);

    return new Response(
      JSON.stringify({ content: generatedContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-video-content function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

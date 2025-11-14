import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Sparkles, Film, LogIn, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoForm } from "@/components/VideoForm";
import { VideoContent } from "@/components/VideoContent";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface GeneratedContent {
  content: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [lastFormData, setLastFormData] = useState<{
    topic: string;
    videoLength: string;
    style: string;
    targetAudience: string;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleGenerate = async (formData: {
    topic: string;
    videoLength: string;
    style: string;
    targetAudience: string;
  }) => {
    setIsGenerating(true);
    setGeneratedContent(null);
    setLastFormData(formData);

    try {
      const { data, error } = await supabase.functions.invoke('generate-video-content', {
        body: formData
      });

      if (error) {
        if (error.message.includes("429")) {
          toast.error("Rate limit exceeded. Please try again later.");
        } else if (error.message.includes("402")) {
          toast.error("Please add credits to your workspace to continue.");
        } else {
          toast.error("Failed to generate content. Please try again.");
        }
        console.error("Error generating content:", error);
        return;
      }

      setGeneratedContent(data);
      toast.success("Video content generated successfully!");

      // If user is logged in, save the project
      if (user && data.content) {
        setTimeout(() => {
          saveProject(formData, data.content);
        }, 0);
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveProject = async (formData: typeof lastFormData, content: string) => {
    if (!formData) return;

    try {
      const { error } = await supabase.from("video_projects").insert({
        user_id: user?.id,
        title: formData.topic.slice(0, 100),
        topic: formData.topic,
        video_length: formData.videoLength,
        style: formData.style,
        target_audience: formData.targetAudience,
        generated_content: content,
      });

      if (error) throw error;
      toast.success("Project saved to your dashboard!");
    } catch (error) {
      console.error("Error saving project:", error);
      toast.error("Generated successfully but failed to save to dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-6 h-6 text-primary" />
              <span className="font-bold text-lg">Video Creator</span>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/dashboard")}
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => navigate("/auth")}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Login
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 pointer-events-none" />
        
        <div className="container mx-auto px-4 py-12 relative">
          {!user && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-primary">Login to save and manage your projects</span>
              </div>
            </div>
          )}
          
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-card rounded-full border border-border">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">AI-Powered Video Production</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-in fade-in slide-in-from-bottom-6 duration-1000">
              YouTube Video Creator
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1200">
              Generate complete video scripts, visual descriptions, music recommendations, and thumbnail concepts in seconds
            </p>
          </div>

          {/* Main Content */}
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="animate-in fade-in slide-in-from-left duration-1000">
              <VideoForm onGenerate={handleGenerate} isGenerating={isGenerating} />
            </div>

            {/* Preview/Results Section */}
            <div className="animate-in fade-in slide-in-from-right duration-1000">
              {isGenerating ? (
                <div className="bg-card rounded-2xl border border-border p-12 flex flex-col items-center justify-center min-h-[600px]">
                  <div className="relative">
                    <Film className="w-20 h-20 text-primary animate-pulse" />
                    <div className="absolute inset-0 animate-ping opacity-20">
                      <Film className="w-20 h-20 text-primary" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold mt-6 mb-2">Generating Your Video Content</h3>
                  <p className="text-muted-foreground text-center max-w-sm">
                    Our AI is crafting a complete video production package for you...
                  </p>
                </div>
              ) : generatedContent ? (
                <VideoContent content={generatedContent.content} />
              ) : (
                <div className="bg-gradient-to-br from-card via-card to-muted rounded-2xl border border-border p-12 flex flex-col items-center justify-center min-h-[600px]">
                  <Video className="w-16 h-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-xl font-semibold mb-2 text-muted-foreground">Ready to Create</h3>
                  <p className="text-muted-foreground/70 text-center max-w-sm">
                    Fill in the details and click generate to create your complete video production package
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;

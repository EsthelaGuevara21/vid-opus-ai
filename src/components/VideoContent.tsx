import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, FileText, Image, Music, Palette } from "lucide-react";
import { toast } from "sonner";

interface VideoContentProps {
  content: string;
}

export const VideoContent = ({ content }: VideoContentProps) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Parse the content into sections
  const sections = {
    script: extractSection(content, "## SCRIPT", "## VISUAL SCENES"),
    visuals: extractSection(content, "## VISUAL SCENES", "## MUSIC RECOMMENDATIONS"),
    music: extractSection(content, "## MUSIC RECOMMENDATIONS", "## THUMBNAIL CONCEPT"),
    thumbnail: extractSection(content, "## THUMBNAIL CONCEPT", null)
  };

  function extractSection(text: string, startMarker: string, endMarker: string | null): string {
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) return "";

    const contentStart = startIndex + startMarker.length;
    const endIndex = endMarker ? text.indexOf(endMarker, contentStart) : text.length;
    
    return text.slice(contentStart, endIndex === -1 ? text.length : endIndex).trim();
  }

  const copyToClipboard = async (text: string, sectionName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionName);
      toast.success(`${sectionName} copied to clipboard!`);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const SectionCard = ({ 
    title, 
    content, 
    icon: Icon, 
    sectionKey 
  }: { 
    title: string; 
    content: string; 
    icon: any; 
    sectionKey: string;
  }) => (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyToClipboard(content, title)}
          className="hover:bg-primary/10"
        >
          {copiedSection === title ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      </div>
      <div className="prose prose-invert max-w-none">
        <pre className="whitespace-pre-wrap text-sm text-foreground bg-background/50 p-4 rounded-lg border border-border overflow-auto max-h-[400px]">
          {content || "No content generated for this section"}
        </pre>
      </div>
    </div>
  );

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-lg">
      <div className="bg-gradient-to-r from-primary/20 to-secondary/20 p-6 border-b border-border">
        <h2 className="text-2xl font-bold mb-2">Your Video Production Package</h2>
        <p className="text-muted-foreground">Everything you need to create your YouTube video</p>
      </div>

      <div className="p-6">
        <Tabs defaultValue="script" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6 bg-muted">
            <TabsTrigger value="script" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Script</span>
            </TabsTrigger>
            <TabsTrigger value="visuals" className="flex items-center gap-2">
              <Image className="w-4 h-4" />
              <span className="hidden sm:inline">Visuals</span>
            </TabsTrigger>
            <TabsTrigger value="music" className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              <span className="hidden sm:inline">Music</span>
            </TabsTrigger>
            <TabsTrigger value="thumbnail" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Thumbnail</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="mt-0">
            <SectionCard
              title="Full Script"
              content={sections.script}
              icon={FileText}
              sectionKey="script"
            />
          </TabsContent>

          <TabsContent value="visuals" className="mt-0">
            <SectionCard
              title="Visual Scene Descriptions"
              content={sections.visuals}
              icon={Image}
              sectionKey="visuals"
            />
          </TabsContent>

          <TabsContent value="music" className="mt-0">
            <SectionCard
              title="Music Recommendations"
              content={sections.music}
              icon={Music}
              sectionKey="music"
            />
          </TabsContent>

          <TabsContent value="thumbnail" className="mt-0">
            <SectionCard
              title="Thumbnail Concept"
              content={sections.thumbnail}
              icon={Palette}
              sectionKey="thumbnail"
            />
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-6 border-t border-border">
          <Button
            onClick={() => copyToClipboard(content, "Complete Package")}
            className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90"
          >
            {copiedSection === "Complete Package" ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied Complete Package!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Complete Package
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

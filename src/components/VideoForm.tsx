import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

interface VideoFormProps {
  onGenerate: (data: {
    topic: string;
    videoLength: string;
    style: string;
    targetAudience: string;
  }) => void;
  isGenerating: boolean;
}

export const VideoForm = ({ onGenerate, isGenerating }: VideoFormProps) => {
  const [topic, setTopic] = useState("");
  const [videoLength, setVideoLength] = useState("5-10 minutes");
  const [style, setStyle] = useState("Educational");
  const [targetAudience, setTargetAudience] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    
    onGenerate({
      topic,
      videoLength,
      style,
      targetAudience: targetAudience || "General audience"
    });
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Video Details</h2>
        <p className="text-muted-foreground">Tell us about your video and we'll create everything you need</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="topic" className="text-base">Video Topic</Label>
          <Textarea
            id="topic"
            placeholder="e.g., 'How to start a successful podcast in 2025'"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            className="min-h-[100px] resize-none bg-background/50 border-border focus:border-primary transition-colors"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="videoLength" className="text-base">Video Length</Label>
          <Select value={videoLength} onValueChange={setVideoLength}>
            <SelectTrigger id="videoLength" className="bg-background/50 border-border focus:border-primary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-3 minutes">1-3 minutes (Short)</SelectItem>
              <SelectItem value="5-10 minutes">5-10 minutes (Standard)</SelectItem>
              <SelectItem value="10-20 minutes">10-20 minutes (Long-form)</SelectItem>
              <SelectItem value="20+ minutes">20+ minutes (Deep Dive)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style" className="text-base">Video Style</Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger id="style" className="bg-background/50 border-border focus:border-primary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Educational">Educational</SelectItem>
              <SelectItem value="Entertainment">Entertainment</SelectItem>
              <SelectItem value="Tutorial">Tutorial / How-to</SelectItem>
              <SelectItem value="Review">Review / Analysis</SelectItem>
              <SelectItem value="Vlog">Vlog / Personal</SelectItem>
              <SelectItem value="Documentary">Documentary</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="targetAudience" className="text-base">Target Audience (Optional)</Label>
          <Input
            id="targetAudience"
            placeholder="e.g., 'Beginner content creators aged 18-35'"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            className="bg-background/50 border-border focus:border-primary transition-colors"
          />
        </div>

        <Button
          type="submit"
          disabled={isGenerating || !topic.trim()}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Video Content
            </>
          )}
        </Button>
      </form>
    </div>
  );
};

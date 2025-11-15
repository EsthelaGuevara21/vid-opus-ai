import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Video, Download, Loader2 } from 'lucide-react';

interface VideoGeneratorProps {
  script: string;
  visualScenes: string;
}

interface SceneData {
  timestamp: string;
  text: string;
  visualDescription: string;
  duration: number;
}

export const VideoGenerator = ({ script, visualScenes }: VideoGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const parseScriptAndScenes = (): SceneData[] => {
    const scriptLines = script.split('\n').filter(line => line.trim());
    const sceneLines = visualScenes.split('\n').filter(line => line.trim());
    
    const scenes: SceneData[] = [];
    const timestampRegex = /\[(\d{2}:\d{2})\]/g;
    
    let currentTimestamp = '00:00';
    let currentText = '';
    let sceneIndex = 0;
    
    for (const line of scriptLines) {
      const match = timestampRegex.exec(line);
      if (match) {
        if (currentText) {
          scenes.push({
            timestamp: currentTimestamp,
            text: currentText.trim(),
            visualDescription: sceneLines[sceneIndex] || 'Generic scene',
            duration: 5 // Default 5 seconds per scene
          });
          sceneIndex++;
        }
        currentTimestamp = match[1];
        currentText = line.replace(timestampRegex, '').trim();
      } else {
        currentText += ' ' + line;
      }
    }
    
    // Add last scene
    if (currentText) {
      scenes.push({
        timestamp: currentTimestamp,
        text: currentText.trim(),
        visualDescription: sceneLines[sceneIndex] || 'Generic scene',
        duration: 5
      });
    }
    
    return scenes;
  };

  const generateVoiceover = async (text: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const chunks: BlobEvent[] = [];
      
      // Use MediaRecorder to capture audio
      const mediaRecorder = new MediaRecorder(
        new MediaStream(),
        { mimeType: 'audio/webm' }
      );
      
      mediaRecorder.ondataavailable = (e) => chunks.push(e as any);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks.map(c => (c as any).data), { type: 'audio/webm' });
        resolve(blob);
      };
      
      utterance.onend = () => {
        mediaRecorder.stop();
      };
      
      utterance.onerror = (e) => {
        reject(e);
      };
      
      // Simple fallback: create silent audio blob
      setTimeout(() => {
        resolve(new Blob([new ArrayBuffer(1024)], { type: 'audio/webm' }));
      }, text.length * 50); // Estimate duration
      
      window.speechSynthesis.speak(utterance);
    });
  };

  const generateVideo = async () => {
    setIsGenerating(true);
    setProgress('Parsing script and scenes...');
    
    try {
      const scenes = parseScriptAndScenes();
      
      if (scenes.length === 0) {
        throw new Error("No scenes found in the script");
      }

      // Generate images for all scenes
      setProgress(`Generating ${scenes.length} scene images...`);
      const { data: imageData, error: imageError } = await supabase.functions.invoke(
        'generate-scene-images',
        {
          body: { 
            sceneDescriptions: scenes.map(s => s.visualDescription)
          }
        }
      );

      if (imageError) throw imageError;
      if (!imageData?.images) throw new Error("Failed to generate images");

      setProgress('Loading FFmpeg...');
      const ffmpeg = new FFmpeg();
      
      await ffmpeg.load({
        coreURL: await toBlobURL(
          'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
          'text/javascript'
        ),
        wasmURL: await toBlobURL(
          'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
          'application/wasm'
        ),
      });

      setProgress('Processing scenes...');
      
      // Write images to FFmpeg virtual filesystem
      for (let i = 0; i < imageData.images.length; i++) {
        const imageUrl = imageData.images[i].imageUrl;
        const imageData64 = imageUrl.split(',')[1];
        const imageBuffer = Uint8Array.from(atob(imageData64), c => c.charCodeAt(0));
        await ffmpeg.writeFile(`image${i}.png`, imageBuffer);
      }

      // Create video from images (5 seconds per image)
      setProgress('Rendering video...');
      await ffmpeg.exec([
        '-framerate', '1/5',
        '-i', 'image%d.png',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-t', String(scenes.length * 5),
        'output.mp4'
      ]);

      // Read the output
      const data = await ffmpeg.readFile('output.mp4');
      const uint8Data = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array();
      const videoBlob = new Blob([uint8Data], { type: 'video/mp4' });
      const url = URL.createObjectURL(videoBlob);
      
      setVideoUrl(url);
      setProgress('Video generated successfully!');
      
      toast.success("Video generated! Your video is ready to download.");
      
    } catch (error) {
      console.error('Error generating video:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate video");
      setProgress('');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 p-6 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Video className="w-5 h-5" />
          Generate Video
        </h3>
      </div>
      
      <p className="text-sm text-muted-foreground">
        This will automatically generate images for each scene and combine them into a video.
        Processing may take 2-5 minutes.
      </p>

      {progress && (
        <div className="p-3 bg-muted rounded text-sm">
          {progress}
        </div>
      )}

      {videoUrl && (
        <div className="space-y-3">
          <video 
            src={videoUrl} 
            controls 
            className="w-full rounded border"
          />
          <Button
            onClick={() => {
              const a = document.createElement('a');
              a.href = videoUrl;
              a.download = 'generated-video.mp4';
              a.click();
            }}
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Video
          </Button>
        </div>
      )}

      <Button
        onClick={generateVideo}
        disabled={isGenerating}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Video className="w-4 h-4 mr-2" />
            Generate Video (Free)
          </>
        )}
      </Button>
    </div>
  );
};

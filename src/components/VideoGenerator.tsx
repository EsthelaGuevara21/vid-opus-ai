import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Subscribe to real-time progress updates
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_generation_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          const job = payload.new as any;
          setProgressPercent(job.progress || 0);
          setCurrentStep(job.current_step || '');
          setProgress(job.current_step || '');
          
          if (job.status === 'failed') {
            toast.error(job.error_message || 'Video generation failed');
            setIsGenerating(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  const parseScriptAndScenes = (): SceneData[] => {
    const scriptLines = script.split('\n').filter(line => line.trim());
    
    // Extract clean visual descriptions from the visual scenes section
    const visualLines = visualScenes.split('\n').filter(line => line.trim());
    const cleanDescriptions: string[] = [];
    
    for (const line of visualLines) {
      // Skip timestamp lines, section headers, and formatting
      if (line.match(/^\[[\d:]+\s*-\s*[\d:]+\]/) || 
          line.match(/^\*\*[A-Z\s]+\*\*$/) ||
          line.startsWith('*   **')) {
        continue;
      }
      // Extract actual visual descriptions from bullet points
      if (line.startsWith('*   **Visuals:**') || line.startsWith('*   **B-roll:**')) {
        const description = line.replace(/^\*\s+\*\*(?:Visuals|B-roll):\*\*\s*/, '').trim();
        if (description.length > 20) {
          cleanDescriptions.push(description);
        }
      }
    }
    
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
            visualDescription: cleanDescriptions[sceneIndex] || 'A professional video scene',
            duration: 5
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
    if (currentText && sceneIndex < cleanDescriptions.length) {
      scenes.push({
        timestamp: currentTimestamp,
        text: currentText.trim(),
        visualDescription: cleanDescriptions[sceneIndex] || 'A professional video scene',
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

  // Generate placeholder images using canvas when AI credits run out
  const generatePlaceholderImages = (scenes: SceneData[]): Array<{ sceneIndex: number; imageUrl: string }> => {
    return scenes.map((scene, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 576;
      const ctx = canvas.getContext('2d')!;

      // Create gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b'];
      gradient.addColorStop(0, colors[index % colors.length]);
      gradient.addColorStop(1, colors[(index + 1) % colors.length]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add scene number
      ctx.fillStyle = 'white';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Scene ${index + 1}`, canvas.width / 2, canvas.height / 2 - 50);

      // Add scene description (truncated)
      ctx.font = '24px sans-serif';
      const maxLength = 60;
      const description = scene.visualDescription.length > maxLength 
        ? scene.visualDescription.substring(0, maxLength) + '...'
        : scene.visualDescription;
      ctx.fillText(description, canvas.width / 2, canvas.height / 2 + 50);

      return {
        sceneIndex: index,
        imageUrl: canvas.toDataURL('image/png')
      };
    });
  };

  const generateVideo = async () => {
    setIsGenerating(true);
    setProgress('Initializing video generation...');
    setProgressPercent(0);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to generate videos');
      }

      // Create a job record
      const { data: job, error: jobError } = await supabase
        .from('video_generation_jobs')
        .insert({
          user_id: user.id,
          status: 'pending',
          progress: 0,
          current_step: 'Parsing script and scenes'
        })
        .select()
        .single();

      if (jobError) throw jobError;
      setJobId(job.id);

      setProgress('Parsing script and scenes...');
      setProgressPercent(5);
      const scenes = parseScriptAndScenes();
      
      if (scenes.length === 0) {
        throw new Error("No scenes found in the script");
      }

      // Try to generate images with AI, fallback to placeholders if credits run out
      setProgress(`Generating ${scenes.length} scene images...`);
      setProgressPercent(10);
      
      let imageData: { images: Array<{ sceneIndex: number; imageUrl: string }> };
      
      try {
        const { data, error: imageError } = await supabase.functions.invoke(
          'generate-scene-images',
          {
            body: { 
              sceneDescriptions: scenes.map(s => s.visualDescription),
              jobId: job.id
            }
          }
        );

        const paymentOrRateError = (message: string) =>
          message.includes('Payment required') ||
          message.includes('payment_required') ||
          message.includes('credits') ||
          message.includes('402');

        const bodyErrorMessage = typeof data?.error === 'string' ? data.error : '';

        if (imageError || bodyErrorMessage) {
          const errorMessage = imageError?.message || bodyErrorMessage || String(imageError);

          if (paymentOrRateError(errorMessage)) {
            console.log("AI credits exhausted, using placeholder images");
            toast.info("AI credits exhausted. Using placeholder images for video generation.", {
              duration: 5000,
            });
            imageData = { images: generatePlaceholderImages(scenes) };
          } else {
            throw imageError || new Error(errorMessage || 'Unknown error generating images');
          }
        } else {
          if (!data?.images) throw new Error("Failed to generate images");
          imageData = data;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Payment required') || errorMessage.includes('payment_required') || 
            errorMessage.includes('credits') || errorMessage.includes('402')) {
          console.log("AI credits exhausted, using placeholder images");
          toast.info("AI credits exhausted. Using placeholder images for video generation.", {
            duration: 5000,
          });
          imageData = { images: generatePlaceholderImages(scenes) };
        } else {
          throw error;
        }
      }

      setProgress('Loading FFmpeg...');
      setProgressPercent(55);
      await supabase
        .from('video_generation_jobs')
        .update({ current_step: 'Loading video processor', progress: 55 })
        .eq('id', job.id);

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
      setProgressPercent(65);
      await supabase
        .from('video_generation_jobs')
        .update({ current_step: 'Processing scene images', progress: 65 })
        .eq('id', job.id);
      
      // Write images to FFmpeg virtual filesystem
      for (let i = 0; i < imageData.images.length; i++) {
        const imageUrl = imageData.images[i].imageUrl;
        const imageData64 = imageUrl.split(',')[1];
        const imageBuffer = Uint8Array.from(atob(imageData64), c => c.charCodeAt(0));
        await ffmpeg.writeFile(`image${i}.png`, imageBuffer);
        
        const imgProgress = 65 + Math.round((i / imageData.images.length) * 15);
        setProgressPercent(imgProgress);
      }

      // Create video from images (5 seconds per image)
      setProgress('Rendering video...');
      setProgressPercent(80);
      await supabase
        .from('video_generation_jobs')
        .update({ current_step: 'Rendering final video', progress: 80 })
        .eq('id', job.id);

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
      setProgressPercent(100);
      
      // Update job as completed
      await supabase
        .from('video_generation_jobs')
        .update({ 
          status: 'completed',
          progress: 100,
          current_step: 'Video generation complete!'
        })
        .eq('id', job.id);
      
      toast.success("Video generated! Your video is ready to download.");
      
    } catch (error) {
      console.error('Error generating video:', error);

      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');

      if (message.includes('Payment required') || message.includes('payment_required') || message.includes('credits')) {
        toast.error('Not enough AI credits. Please add credits to your workspace to generate videos.', {
          duration: 5000,
        });
      } else if (message.includes('rate limit') || message.includes('rate_limited') || message.includes('429')) {
        toast.error('Rate limit exceeded. Please wait a bit and try again.', {
          duration: 5000,
        });
      } else {
        toast.error(message || 'Failed to generate video');
      }

      // Update job as failed
      if (jobId) {
        await supabase
          .from('video_generation_jobs')
          .update({
            status: 'failed',
            error_message: message,
          })
          .eq('id', jobId);
      }

      setProgress('');
      setProgressPercent(0);
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
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{currentStep || progress}</span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
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

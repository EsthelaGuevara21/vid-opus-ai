-- Create video generation jobs table for tracking progress
CREATE TABLE public.video_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,
  total_scenes INTEGER,
  completed_scenes INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own jobs" 
ON public.video_generation_jobs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own jobs" 
ON public.video_generation_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs" 
ON public.video_generation_jobs 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_video_generation_jobs_updated_at
BEFORE UPDATE ON public.video_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for progress tracking
ALTER TABLE public.video_generation_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_generation_jobs;
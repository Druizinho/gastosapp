-- RLS Policies para connections
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connections"
    ON public.connections
    FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create connection requests"
    ON public.connections
    FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Receivers can update connection status"
    ON public.connections
    FOR UPDATE
    USING (auth.uid() = receiver_id OR auth.uid() = requester_id);

CREATE POLICY "Users can delete their connections"
    ON public.connections
    FOR DELETE
    USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

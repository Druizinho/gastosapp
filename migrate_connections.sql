CREATE TABLE public.connections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status       VARCHAR(10) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT _connection_unique UNIQUE (requester_id, receiver_id),
    CONSTRAINT _no_self_connection CHECK (requester_id != receiver_id)
);

CREATE INDEX idx_connections_requester ON connections(requester_id);
CREATE INDEX idx_connections_receiver ON connections(receiver_id);

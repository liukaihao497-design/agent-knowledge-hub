CREATE EXTENSION IF NOT EXISTS vector;

-- 查询表：SELECT * FROM information_schema.tables;

DROP TABLE IF EXISTS public.vector_store;

CREATE TABLE public.vector_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding VECTOR(1536)
);

DROP TABLE IF EXISTS public.store_openai;

CREATE TABLE public.store_openai (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding VECTOR(1536)
);

DROP TABLE IF EXISTS public.vector_store_openai;

CREATE TABLE public.vector_store_openai (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding VECTOR(1536)
);

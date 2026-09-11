-- 在现有 PostgreSQL 向量数据库执行；复用 vector 扩展，只新增知识库自己的表。
-- 1536 必须与嵌入模型实际输出、knowledge.vector-dimensions 一致。
-- 使用其他维度时，首次建表前调整这里，并在模型支持的情况下配置 embedding.options.dimensions。
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS public.knowledge_vector_store (
    id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL,
    embedding VECTOR(1536) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_vector_embedding
    ON public.knowledge_vector_store USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_vector_metadata
    ON public.knowledge_vector_store USING gin (metadata);

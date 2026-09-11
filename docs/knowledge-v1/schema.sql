-- 在应用现有 MySQL 数据库中手工执行；不自动建表，不删除或修改既有业务表。
CREATE TABLE IF NOT EXISTS knowledge_document (
    document_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '文档UUID',
    knowledge_base_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '逻辑知识库标识',
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
    bucket_name VARCHAR(63) DEFAULT NULL,
    object_key VARCHAR(512) DEFAULT NULL,
    content_url VARCHAR(512) DEFAULT NULL COMMENT '本服务稳定入口，非临时签名URL',
    status VARCHAR(20) NOT NULL COMMENT 'UPLOADING/UPLOADED/INDEXING/READY/FAILED',
    chunk_count INT NOT NULL DEFAULT 0,
    error_message VARCHAR(500) DEFAULT NULL COMMENT '失败阶段及安全提示，不存凭据',
    ext_info JSON DEFAULT NULL COMMENT '扩展字段1',
    ext_remark VARCHAR(500) DEFAULT NULL COMMENT '扩展字段2',
    create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (document_id),
    KEY idx_knowledge_document_list (knowledge_base_id, create_time, document_id),
    KEY idx_knowledge_document_status (knowledge_base_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库原始文档';

CREATE TABLE IF NOT EXISTS knowledge_chunk (
    chunk_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID，与向量ID相同',
    document_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    chunk_index INT NOT NULL COMMENT '从1开始',
    content MEDIUMTEXT NOT NULL,
    char_count INT NOT NULL,
    metadata JSON NOT NULL,
    ext_info JSON DEFAULT NULL COMMENT '扩展字段1',
    ext_remark VARCHAR(500) DEFAULT NULL COMMENT '扩展字段2',
    create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (chunk_id),
    UNIQUE KEY uk_knowledge_chunk_order (document_id, chunk_index),
    CONSTRAINT fk_knowledge_chunk_document FOREIGN KEY (document_id) REFERENCES knowledge_document(document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库文档切片';

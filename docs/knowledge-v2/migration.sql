-- 在应用现有 MySQL 数据库执行。先部署前暂停旧知识库的上传，执行后再启动新版服务。
-- 只新增知识库信息表并补齐旧记录；不修改/删除文档、切片、PgVector 或 MinIO 文件。
CREATE TABLE IF NOT EXISTS knowledge_base (
    knowledge_base_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '稳定知识库标识，新建使用UUID',
    name VARCHAR(100) NOT NULL COMMENT '显示名称，可修改',
    description VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '知识库说明',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE、DISABLED',
    create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (knowledge_base_id),
    KEY idx_knowledge_base_status (status, create_time, knowledge_base_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库信息';

-- 保留 demo 等原有 ID，向量 metadata 中的归属无需重写。
-- 可重复执行；不覆盖用户已改过的名称、说明和状态。
INSERT INTO knowledge_base (knowledge_base_id, name, description, status, create_time, update_time)
SELECT d.knowledge_base_id, d.knowledge_base_id, '从已有文档迁移的知识库', 'ACTIVE',
       MIN(d.create_time), MAX(d.update_time)
FROM knowledge_document d
LEFT JOIN knowledge_base b ON b.knowledge_base_id = d.knowledge_base_id
WHERE b.knowledge_base_id IS NULL
GROUP BY d.knowledge_base_id;

package com.lkh.domain.knowlege.service;

import com.lkh.domain.knowlege.model.entity.KnowledgeBaseEntity;
import com.lkh.domain.knowlege.model.valobj.KnowledgePage;

public interface IKnowledgeBaseService {

    KnowledgeBaseEntity create(String name, String description);

    KnowledgePage<KnowledgeBaseEntity> list(String status, int page, int pageSize);

    KnowledgeBaseEntity get(String knowledgeBaseId);

    KnowledgeBaseEntity update(String knowledgeBaseId, String name, String description);

    KnowledgeBaseEntity changeStatus(String knowledgeBaseId, String status);

    /** 上传、问答入口必须在任何外部存储或模型调用前完成检查。 */
    KnowledgeBaseEntity requireActive(String knowledgeBaseId);

}

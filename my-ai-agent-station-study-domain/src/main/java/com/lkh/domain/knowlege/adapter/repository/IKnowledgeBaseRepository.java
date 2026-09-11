package com.lkh.domain.knowlege.adapter.repository;

import com.lkh.domain.knowlege.model.entity.KnowledgeBaseEntity;

import java.util.List;

public interface IKnowledgeBaseRepository {

    void create(KnowledgeBaseEntity knowledgeBase);

    KnowledgeBaseEntity find(String knowledgeBaseId);

    List<KnowledgeBaseEntity> list(String status, int offset, int limit);

    long count(String status);

    void updateInformation(KnowledgeBaseEntity knowledgeBase);

    void updateStatus(KnowledgeBaseEntity knowledgeBase);

}

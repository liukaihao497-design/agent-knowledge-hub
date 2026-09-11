package com.lkh.domain.knowlege.service;

import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.domain.knowlege.model.valobj.*;

public interface IKnowledgeService {
    KnowledgeDocumentEntity upload(String knowledgeBaseId, String fileName, byte[] content);
    KnowledgeAnswer ask(String knowledgeBaseId, String question, Integer topK);
    KnowledgePage<KnowledgeDocumentEntity> documents(String knowledgeBaseId, int page, int pageSize);
    KnowledgeDocumentEntity document(String knowledgeBaseId, String documentId);
    KnowledgePage<KnowledgeChunkEntity> chunks(String knowledgeBaseId, String documentId, int page, int pageSize);
    KnowledgeChunkEntity chunk(String knowledgeBaseId, String chunkId);
    String contentUrl(String knowledgeBaseId, String documentId);
}

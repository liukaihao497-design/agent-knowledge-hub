package com.lkh.domain.knowlege.adapter.repository;

import com.lkh.domain.knowlege.model.entity.*;
import java.util.List;

public interface IKnowledgeRepository {
    void createDocument(KnowledgeDocumentEntity document);
    void updateDocument(KnowledgeDocumentEntity document);
    void saveChunks(KnowledgeDocumentEntity document, List<KnowledgeChunkEntity> chunks);
    KnowledgeDocumentEntity findDocument(String documentId);
    KnowledgeChunkEntity findChunk(String chunkId);
    List<KnowledgeDocumentEntity> listDocuments(String knowledgeBaseId, int offset, int limit);
    long countDocuments(String knowledgeBaseId);
    List<KnowledgeChunkEntity> listChunks(String documentId, int offset, int limit);
    long countChunks(String documentId);
}

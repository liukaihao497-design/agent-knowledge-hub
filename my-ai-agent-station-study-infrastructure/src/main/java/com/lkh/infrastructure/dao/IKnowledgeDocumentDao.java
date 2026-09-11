package com.lkh.infrastructure.dao;

import com.lkh.infrastructure.dao.po.KnowledgeDocument;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface IKnowledgeDocumentDao {
    int insert(KnowledgeDocument document);
    int update(KnowledgeDocument document);
    KnowledgeDocument find(@Param("documentId") String documentId);
    List<KnowledgeDocument> list(@Param("knowledgeBaseId") String knowledgeBaseId, @Param("offset") int offset, @Param("limit") int limit);
    long count(@Param("knowledgeBaseId") String knowledgeBaseId);
}

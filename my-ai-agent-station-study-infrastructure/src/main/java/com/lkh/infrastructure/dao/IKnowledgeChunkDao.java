package com.lkh.infrastructure.dao;

import com.lkh.infrastructure.dao.po.KnowledgeChunk;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface IKnowledgeChunkDao {
    int insertBatch(@Param("chunks") List<KnowledgeChunk> chunks);
    KnowledgeChunk find(@Param("chunkId") String chunkId);
    List<KnowledgeChunk> list(@Param("documentId") String documentId, @Param("offset") int offset, @Param("limit") int limit);
    long count(@Param("documentId") String documentId);
}

package com.lkh.infrastructure.dao;

import com.lkh.infrastructure.dao.po.KnowledgeBase;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface IKnowledgeBaseDao {

    int insert(KnowledgeBase knowledgeBase);

    KnowledgeBase find(@Param("knowledgeBaseId") String knowledgeBaseId);

    List<KnowledgeBase> list(@Param("status") String status, @Param("offset") int offset, @Param("limit") int limit);

    long count(@Param("status") String status);

    int updateInformation(KnowledgeBase knowledgeBase);

    int updateStatus(KnowledgeBase knowledgeBase);

}

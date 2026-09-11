package com.lkh.infrastructure.adapter.repository;

import com.lkh.domain.knowlege.adapter.repository.IKnowledgeBaseRepository;
import com.lkh.domain.knowlege.model.entity.KnowledgeBaseEntity;
import com.lkh.infrastructure.dao.IKnowledgeBaseDao;
import com.lkh.infrastructure.dao.po.KnowledgeBase;
import org.springframework.beans.BeanUtils;

import java.util.List;

public class KnowledgeBaseRepository implements IKnowledgeBaseRepository {

    private final IKnowledgeBaseDao knowledgeBaseDao;

    public KnowledgeBaseRepository(IKnowledgeBaseDao knowledgeBaseDao) {
        this.knowledgeBaseDao = knowledgeBaseDao;
    }

    @Override
    public void create(KnowledgeBaseEntity knowledgeBase) {
        requireOne(knowledgeBaseDao.insert(toPo(knowledgeBase)));
    }

    @Override
    public KnowledgeBaseEntity find(String knowledgeBaseId) {
        return toEntity(knowledgeBaseDao.find(knowledgeBaseId));
    }

    @Override
    public List<KnowledgeBaseEntity> list(String status, int offset, int limit) {
        return knowledgeBaseDao.list(status, offset, limit).stream().map(this::toEntity).toList();
    }

    @Override
    public long count(String status) {
        return knowledgeBaseDao.count(status);
    }

    @Override
    public void updateInformation(KnowledgeBaseEntity knowledgeBase) {
        requireOne(knowledgeBaseDao.updateInformation(toPo(knowledgeBase)));
    }

    @Override
    public void updateStatus(KnowledgeBaseEntity knowledgeBase) {
        requireOne(knowledgeBaseDao.updateStatus(toPo(knowledgeBase)));
    }

    private KnowledgeBase toPo(KnowledgeBaseEntity entity) {
        KnowledgeBase po = new KnowledgeBase();
        BeanUtils.copyProperties(entity, po);
        return po;
    }

    private KnowledgeBaseEntity toEntity(KnowledgeBase po) {
        if (po == null) return null;
        KnowledgeBaseEntity entity = new KnowledgeBaseEntity();
        BeanUtils.copyProperties(po, entity);
        return entity;
    }

    private static void requireOne(int rows) {
        if (rows != 1) throw new IllegalStateException("知识库信息写入失败");
    }

}

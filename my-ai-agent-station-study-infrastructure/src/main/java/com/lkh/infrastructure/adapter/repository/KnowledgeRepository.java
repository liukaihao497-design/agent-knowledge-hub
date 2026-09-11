package com.lkh.infrastructure.adapter.repository;

import com.lkh.domain.knowlege.adapter.repository.IKnowledgeRepository;
import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.infrastructure.dao.*;
import com.lkh.infrastructure.dao.po.*;
import org.springframework.beans.BeanUtils;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;

/** MySQL 事务只包围本地写入，不持有事务等待模型/MinIO 网络调用。 */
public class KnowledgeRepository implements IKnowledgeRepository {
    private final IKnowledgeDocumentDao documentDao;
    private final IKnowledgeChunkDao chunkDao;
    private final TransactionTemplate transaction;
    public KnowledgeRepository(IKnowledgeDocumentDao documentDao, IKnowledgeChunkDao chunkDao, TransactionTemplate transaction) {
        this.documentDao = documentDao;
        this.chunkDao = chunkDao;
        this.transaction = transaction;
    }
    public void createDocument(KnowledgeDocumentEntity document) {
        KnowledgeDocument po = new KnowledgeDocument();
        BeanUtils.copyProperties(document, po);
        requireOne(documentDao.insert(po));
    }
    public void updateDocument(KnowledgeDocumentEntity document) {
        KnowledgeDocument po = new KnowledgeDocument();
        BeanUtils.copyProperties(document, po);
        requireOne(documentDao.update(po));
    }
    public void saveChunks(KnowledgeDocumentEntity document, List<KnowledgeChunkEntity> chunks) {
        transaction.executeWithoutResult(status -> {
            List<KnowledgeChunk> rows = chunks.stream().map(entity -> {
                KnowledgeChunk po = new KnowledgeChunk();
                BeanUtils.copyProperties(entity, po);
                return po;
            }).toList();
            for (int i = 0; i < rows.size(); i += 100) {
                List<KnowledgeChunk> batch = rows.subList(i, Math.min(i + 100, rows.size()));
                if (chunkDao.insertBatch(batch) != batch.size()) throw new IllegalStateException("切片写入数量不一致");
            }
            updateDocument(document);
        });
    }
    public KnowledgeDocumentEntity findDocument(String id) { return documentEntity(documentDao.find(id)); }
    public KnowledgeChunkEntity findChunk(String id) { return chunkEntity(chunkDao.find(id)); }
    public List<KnowledgeDocumentEntity> listDocuments(String id, int offset, int limit) {
        return documentDao.list(id, offset, limit).stream().map(this::documentEntity).toList();
    }
    public long countDocuments(String id) { return documentDao.count(id); }
    public List<KnowledgeChunkEntity> listChunks(String id, int offset, int limit) {
        return chunkDao.list(id, offset, limit).stream().map(this::chunkEntity).toList();
    }
    public long countChunks(String id) { return chunkDao.count(id); }
    private KnowledgeDocumentEntity documentEntity(KnowledgeDocument po) {
        if (po == null) return null;
        KnowledgeDocumentEntity entity = new KnowledgeDocumentEntity();
        BeanUtils.copyProperties(po, entity);
        return entity;
    }
    private KnowledgeChunkEntity chunkEntity(KnowledgeChunk po) {
        if (po == null) return null;
        KnowledgeChunkEntity entity = new KnowledgeChunkEntity();
        BeanUtils.copyProperties(po, entity);
        return entity;
    }
    private static void requireOne(int rows) {
        if (rows != 1) throw new IllegalStateException("文档状态写入失败");
    }
}

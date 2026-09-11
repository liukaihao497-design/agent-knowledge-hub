package com.lkh.domain.knowlege.service;

import com.lkh.domain.knowlege.adapter.repository.IKnowledgeBaseRepository;
import com.lkh.domain.knowlege.model.entity.KnowledgeBaseEntity;
import com.lkh.domain.knowlege.model.valobj.KnowledgeBaseStatus;
import com.lkh.domain.knowlege.model.valobj.KnowledgeException;
import com.lkh.domain.knowlege.model.valobj.KnowledgePage;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

/** 知识库生命周期管理，不依赖 agent 装配和执行领域。 */
public class KnowledgeBaseService implements IKnowledgeBaseService {

    private final IKnowledgeBaseRepository repository;

    public KnowledgeBaseService(IKnowledgeBaseRepository repository) {
        this.repository = repository;
    }

    @Override
    public KnowledgeBaseEntity create(String name, String description) {
        String normalizedName = validateName(name);
        String normalizedDescription = validateDescription(description);
        LocalDateTime now = LocalDateTime.now();
        KnowledgeBaseEntity knowledgeBase = KnowledgeBaseEntity.builder()
                .knowledgeBaseId(UUID.randomUUID().toString())
                .name(normalizedName).description(normalizedDescription)
                .status(KnowledgeBaseStatus.ACTIVE.name())
                .createTime(now).updateTime(now).build();
        repository.create(knowledgeBase);
        return knowledgeBase;
    }

    @Override
    public KnowledgePage<KnowledgeBaseEntity> list(String status, int page, int pageSize) {
        if (status != null) validateStatus(status);
        if (page < 1 || page > 1_000_000 || pageSize < 1 || pageSize > 100) {
            throw new KnowledgeException(400, "page 限 1–1000000，pageSize 限 1–100");
        }
        return new KnowledgePage<>(repository.list(status, (page - 1) * pageSize, pageSize),
                repository.count(status), page, pageSize);
    }

    @Override
    public KnowledgeBaseEntity get(String knowledgeBaseId) {
        // 兼容迁移前的 demo 等逻辑标识；新建只由服务端生成 UUID。
        if (knowledgeBaseId == null || !knowledgeBaseId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new KnowledgeException(400, "knowledgeBaseId 限 1–64 位字母、数字、下划线或短横线");
        }
        KnowledgeBaseEntity knowledgeBase = repository.find(knowledgeBaseId);
        if (knowledgeBase == null) throw new KnowledgeException(404, "知识库不存在");
        return knowledgeBase;
    }

    @Override
    public KnowledgeBaseEntity update(String knowledgeBaseId, String name, String description) {
        String normalizedName = validateName(name);
        String normalizedDescription = validateDescription(description);
        KnowledgeBaseEntity knowledgeBase = get(knowledgeBaseId);
        if (Objects.equals(knowledgeBase.getName(), normalizedName)
                && Objects.equals(knowledgeBase.getDescription(), normalizedDescription)) return knowledgeBase;
        knowledgeBase.setName(normalizedName);
        knowledgeBase.setDescription(normalizedDescription);
        knowledgeBase.setUpdateTime(LocalDateTime.now());
        repository.updateInformation(knowledgeBase);
        return knowledgeBase;
    }

    @Override
    public KnowledgeBaseEntity changeStatus(String knowledgeBaseId, String status) {
        validateStatus(status);
        KnowledgeBaseEntity knowledgeBase = get(knowledgeBaseId);
        if (status.equals(knowledgeBase.getStatus())) return knowledgeBase;
        knowledgeBase.setStatus(status);
        knowledgeBase.setUpdateTime(LocalDateTime.now());
        repository.updateStatus(knowledgeBase);
        return knowledgeBase;
    }

    @Override
    public KnowledgeBaseEntity requireActive(String knowledgeBaseId) {
        KnowledgeBaseEntity knowledgeBase = get(knowledgeBaseId);
        if (!KnowledgeBaseStatus.ACTIVE.name().equals(knowledgeBase.getStatus())) {
            throw new KnowledgeException(409, "知识库已停用，请选择其他知识库或先启用");
        }
        return knowledgeBase;
    }

    private static String validateName(String name) {
        if (name == null || name.isBlank() || name.trim().length() > 100
                || name.chars().anyMatch(Character::isISOControl)) {
            throw new KnowledgeException(400, "知识库名称不能为空，最多 100 个字符，不能包含控制字符");
        }
        return name.trim();
    }

    private static String validateDescription(String description) {
        String value = description == null ? "" : description.trim();
        if (value.length() > 1000) throw new KnowledgeException(400, "知识库说明最多 1000 个字符");
        return value;
    }

    private static void validateStatus(String status) {
        if (!KnowledgeBaseStatus.ACTIVE.name().equals(status) && !KnowledgeBaseStatus.DISABLED.name().equals(status)) {
            throw new KnowledgeException(400, "知识库状态仅支持 ACTIVE 或 DISABLED");
        }
    }

}

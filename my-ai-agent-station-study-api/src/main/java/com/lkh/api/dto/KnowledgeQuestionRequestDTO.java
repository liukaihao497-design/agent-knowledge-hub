package com.lkh.api.dto;

/** topK 为空时使用 5，范围由领域服务统一校验。 */
public record KnowledgeQuestionRequestDTO(String knowledgeBaseId, String question, Integer topK) {}

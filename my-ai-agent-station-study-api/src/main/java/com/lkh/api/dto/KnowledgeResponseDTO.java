package com.lkh.api.dto;

import java.time.LocalDateTime;
import java.util.List;

/** API 模型不依赖领域对象或持久化 PO。 */
public final class KnowledgeResponseDTO {
    private KnowledgeResponseDTO() {}
    public record Base(String knowledgeBaseId, String name, String description, String status,
                       LocalDateTime createTime, LocalDateTime updateTime) {}
    public record Page<T>(List<T> items, long total, int page, int pageSize) {}
    public record Document(String documentId, String knowledgeBaseId, String fileName, String contentType,
                           long fileSize, String sha256, String status, int chunkCount, String contentUrl,
                           String errorMessage, String extInfo, String extRemark,
                           LocalDateTime createTime, LocalDateTime updateTime) {}
    public record Chunk(String chunkId, String documentId, int chunkIndex, String content, int charCount,
                        String metadata, String extInfo, String extRemark, LocalDateTime createTime) {}
    public record Answer(String answer, List<Reference> references) {}
    public record Reference(int number, String documentId, String chunkId, int chunkIndex, String fileName,
                            String content, Double score, String chunkUrl, String contentUrl) {}
    public record Failure(String documentId) {}
}

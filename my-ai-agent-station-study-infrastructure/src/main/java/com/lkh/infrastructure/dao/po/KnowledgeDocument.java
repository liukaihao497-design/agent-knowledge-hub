package com.lkh.infrastructure.dao.po;

import lombok.*;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeDocument {
    private String documentId;
    private String knowledgeBaseId;
    private String fileName;
    private String contentType;
    private long fileSize;
    private String sha256;
    private String bucketName;
    private String objectKey;
    private String contentUrl;
    private String status;
    private int chunkCount;
    private String errorMessage;
    private String extInfo;
    private String extRemark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

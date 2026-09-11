package com.lkh.domain.knowlege.model.entity;

import lombok.*;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeChunkEntity {
    private String chunkId;
    private String documentId;
    private int chunkIndex;
    private String content;
    private int charCount;
    private String metadata;
    private String extInfo;
    private String extRemark;
    private LocalDateTime createTime;
}

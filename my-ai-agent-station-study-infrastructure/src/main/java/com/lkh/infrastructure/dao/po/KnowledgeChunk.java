package com.lkh.infrastructure.dao.po;

import lombok.*;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeChunk {
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

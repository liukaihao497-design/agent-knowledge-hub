package com.lkh.infrastructure.dao.po;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeBase {

    private String knowledgeBaseId;
    private String name;
    private String description;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

}

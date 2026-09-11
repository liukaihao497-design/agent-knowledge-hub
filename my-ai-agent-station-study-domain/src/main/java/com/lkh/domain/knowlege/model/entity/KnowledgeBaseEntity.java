package com.lkh.domain.knowlege.model.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 知识库信息；标识一经创建不可修改，名称仅用于展示。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeBaseEntity {

    private String knowledgeBaseId;
    private String name;
    private String description;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

}

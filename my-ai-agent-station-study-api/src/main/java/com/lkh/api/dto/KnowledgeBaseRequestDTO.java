package com.lkh.api.dto;

/** 创建和修改只接收显示信息，知识库 ID 由后端生成。 */
public record KnowledgeBaseRequestDTO(String name, String description) {
}

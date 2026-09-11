package com.lkh.domain.knowlege.model.valobj;

import java.util.List;

public record KnowledgeAnswer(String answer, List<Reference> references) {
    public record Reference(int number, String documentId, String chunkId, int chunkIndex,
                            String fileName, String content, Double score, String chunkUrl, String contentUrl) {}
}

package com.lkh.domain.knowlege.adapter.port;

import java.util.List;
import org.springframework.ai.document.Document;

public interface IKnowledgeParserPort {
    List<Document> parse(String fileName, byte[] content);
}

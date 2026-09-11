package com.lkh.infrastructure.adapter.port;

import com.lkh.domain.knowlege.adapter.port.IKnowledgeParserPort;
import org.springframework.ai.document.Document;
import org.springframework.ai.reader.ExtractedTextFormatter;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.core.io.ByteArrayResource;
import org.apache.tika.sax.BodyContentHandler;
import java.util.List;

public class KnowledgeTikaParserPort implements IKnowledgeParserPort {
    @Override
    public List<Document> parse(String fileName, byte[] content) {
        ByteArrayResource resource = new ByteArrayResource(content) {
            @Override public String getFilename() { return fileName; }
        };
        // 在提取阶段限制正文大小，防止先生成无限大的文本再检查长度。
        return new TikaDocumentReader(resource, new BodyContentHandler(2_000_000),
                ExtractedTextFormatter.defaults()).get();
    }
}

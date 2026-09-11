package com.lkh.trigger.http;

import com.lkh.api.IKnowledgeApiService;
import com.lkh.api.dto.KnowledgeQuestionRequestDTO;
import com.lkh.api.dto.KnowledgeResponseDTO.*;
import com.lkh.api.response.Response;
import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.domain.knowlege.model.valobj.KnowledgeException;
import com.lkh.domain.knowlege.service.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;

@RestController
@RequestMapping("/api/v1/knowledge")
@ConditionalOnProperty(name = "knowledge.enabled", havingValue = "true")
public class KnowledgeController implements IKnowledgeApiService {
    private final IKnowledgeService service;
    public KnowledgeController(IKnowledgeService service) { this.service = service; }

    @Override
    @PostMapping(value = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Response<Document> upload(@RequestParam("knowledgeBaseId") String knowledgeBaseId,
                                     @RequestPart("file") MultipartFile file) throws IOException {
        if (file.isEmpty() || file.getSize() > KnowledgeService.MAX_FILE_BYTES) {
            throw new KnowledgeException(400, "文件不能为空，最大支持 10 MiB");
        }
        try (InputStream stream = file.getInputStream()) {
            byte[] bytes = stream.readNBytes(KnowledgeService.MAX_FILE_BYTES + 1);
            return ok(toDocument(service.upload(knowledgeBaseId, file.getOriginalFilename(), bytes)));
        }
    }

    @Override
    @GetMapping("/documents")
    public Response<Page<Document>> documents(@RequestParam("knowledgeBaseId") String knowledgeBaseId,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        var result = service.documents(knowledgeBaseId, page, pageSize);
        return ok(new Page<>(result.items().stream().map(this::toDocument).toList(), result.total(), page, pageSize));
    }

    @Override
    @GetMapping("/documents/{documentId}")
    public Response<Document> document(@RequestParam("knowledgeBaseId") String knowledgeBaseId,
                                       @PathVariable("documentId") String documentId) {
        return ok(toDocument(service.document(knowledgeBaseId, documentId)));
    }

    @Override
    @GetMapping("/documents/{documentId}/chunks")
    public Response<Page<Chunk>> chunks(@RequestParam("knowledgeBaseId") String knowledgeBaseId,
            @PathVariable("documentId") String documentId,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        var result = service.chunks(knowledgeBaseId, documentId, page, pageSize);
        return ok(new Page<>(result.items().stream().map(this::toChunk).toList(), result.total(), page, pageSize));
    }

    @Override
    @GetMapping("/chunks/{chunkId}")
    public Response<Chunk> chunk(@RequestParam("knowledgeBaseId") String knowledgeBaseId,
                                 @PathVariable("chunkId") String chunkId) {
        return ok(toChunk(service.chunk(knowledgeBaseId, chunkId)));
    }

    @Override
    @GetMapping("/documents/{documentId}/content")
    public ResponseEntity<Void> content(@RequestParam("knowledgeBaseId") String knowledgeBaseId,
                                        @PathVariable("documentId") String documentId) {
        return ResponseEntity.status(HttpStatus.FOUND).cacheControl(CacheControl.noStore())
                .location(URI.create(service.contentUrl(knowledgeBaseId, documentId))).build();
    }

    @Override
    @PostMapping(value = "/questions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Response<Answer> ask(@RequestBody KnowledgeQuestionRequestDTO request) {
        var result = service.ask(request.knowledgeBaseId(), request.question(), request.topK());
        return ok(new Answer(result.answer(), result.references().stream().map(r -> new Reference(
                r.number(), r.documentId(), r.chunkId(), r.chunkIndex(), r.fileName(), r.content(),
                r.score(), r.chunkUrl(), r.contentUrl())).toList()));
    }

    private Document toDocument(KnowledgeDocumentEntity d) {
        return new Document(d.getDocumentId(), d.getKnowledgeBaseId(), d.getFileName(), d.getContentType(),
                d.getFileSize(), d.getSha256(), d.getStatus(), d.getChunkCount(), d.getContentUrl() == null ? null
                        : KnowledgeService.API + "/documents/" + d.getDocumentId() + "/content?knowledgeBaseId=" + d.getKnowledgeBaseId(),
                d.getErrorMessage(), d.getExtInfo(), d.getExtRemark(), d.getCreateTime(), d.getUpdateTime());
    }
    private Chunk toChunk(KnowledgeChunkEntity c) {
        return new Chunk(c.getChunkId(), c.getDocumentId(), c.getChunkIndex(), c.getContent(),
                c.getCharCount(), c.getMetadata(), c.getExtInfo(), c.getExtRemark(), c.getCreateTime());
    }
    private <T> Response<T> ok(T data) { return Response.<T>builder().code("0000").info("成功").data(data).build(); }
}

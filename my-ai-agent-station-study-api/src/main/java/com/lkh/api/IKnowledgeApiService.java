package com.lkh.api;

import com.lkh.api.dto.KnowledgeQuestionRequestDTO;
import com.lkh.api.dto.KnowledgeResponseDTO.*;
import com.lkh.api.response.Response;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;

public interface IKnowledgeApiService {
    Response<Document> upload(String knowledgeBaseId, MultipartFile file) throws IOException;
    Response<Page<Document>> documents(String knowledgeBaseId, int page, int pageSize);
    Response<Document> document(String knowledgeBaseId, String documentId);
    Response<Page<Chunk>> chunks(String knowledgeBaseId, String documentId, int page, int pageSize);
    Response<Chunk> chunk(String knowledgeBaseId, String chunkId);
    ResponseEntity<Void> content(String knowledgeBaseId, String documentId);
    Response<Answer> ask(KnowledgeQuestionRequestDTO request);
}

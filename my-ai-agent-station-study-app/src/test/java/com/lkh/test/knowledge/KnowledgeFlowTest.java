package com.lkh.test.knowledge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lkh.domain.knowlege.adapter.port.IKnowledgeFilePort;
import com.lkh.domain.knowlege.adapter.repository.IKnowledgeRepository;
import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.domain.knowlege.service.KnowledgeService;
import com.lkh.domain.knowlege.service.IKnowledgeBaseService;
import com.lkh.infrastructure.adapter.port.KnowledgeTikaParserPort;
import com.lkh.trigger.http.*;
import org.junit.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 连通 HTTP → 领域 → 真实解析/切分 → 存储适配契约 → 问答引用；外部服务为替身。 */
public class KnowledgeFlowTest {
    @Test public void uploadInspectAskAndFollowReferenceThroughHttp() throws Exception {
        var repository = mock(IKnowledgeRepository.class); var filePort = mock(IKnowledgeFilePort.class);
        var vectorStore = mock(VectorStore.class); var model = mock(ChatModel.class);
        Map<String, KnowledgeDocumentEntity> documents = new LinkedHashMap<>();
        Map<String, KnowledgeChunkEntity> chunks = new LinkedHashMap<>(); List<Document> index = new ArrayList<>();
        doAnswer(i -> { var d = i.<KnowledgeDocumentEntity>getArgument(0); documents.put(d.getDocumentId(), d); return null; }).when(repository).createDocument(any());
        doAnswer(i -> { for (var c : i.<List<KnowledgeChunkEntity>>getArgument(1)) chunks.put(c.getChunkId(), c); return null; }).when(repository).saveChunks(any(), anyList());
        when(repository.findDocument(anyString())).thenAnswer(i -> documents.get(i.getArgument(0)));
        when(repository.findChunk(anyString())).thenAnswer(i -> chunks.get(i.getArgument(0)));
        when(repository.listChunks(anyString(), anyInt(), anyInt())).thenAnswer(i -> List.copyOf(chunks.values()));
        when(repository.countChunks(anyString())).thenAnswer(i -> (long) chunks.size());
        when(repository.listDocuments(anyString(), anyInt(), anyInt())).thenAnswer(i -> List.copyOf(documents.values()));
        when(repository.countDocuments(anyString())).thenAnswer(i -> (long) documents.size());
        when(filePort.upload(anyString(), anyString(), any())).thenReturn(new IKnowledgeFilePort.StoredFile("test-bucket", "test-original"));
        when(filePort.downloadUrl(anyString(), anyString(), anyString())).thenReturn("https://example.invalid/original?signature=test");
        doAnswer(i -> { index.addAll(i.getArgument(0)); return null; }).when(vectorStore).add(anyList());
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenAnswer(i -> List.copyOf(index));
        when(model.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of(new Generation(new AssistantMessage("文档原件保存在 MinIO。[1]")))));
        var service = new KnowledgeService(repository, mock(IKnowledgeBaseService.class), filePort, new KnowledgeTikaParserPort(), new TokenTextSplitter(), vectorStore, model, .5);
        var mvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service)).setControllerAdvice(new KnowledgeExceptionHandler()).build();
        var json = new ObjectMapper(); String api = "/api/v1/knowledge";
        byte[] original = "文档原件保存到 MinIO。chunk 正文保存到 MySQL。只有 READY 文档可以参与问答。".getBytes(StandardCharsets.UTF_8);
        String upload = mvc.perform(multipart(api + "/documents")
                        .file(new MockMultipartFile("file", "知识库.txt", "text/plain", original)).param("knowledgeBaseId", "demo"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String documentId = json.readTree(upload).path("data").path("documentId").asText();
        verify(filePort).upload(eq(documentId), eq("text/plain"), aryEq(original));
        mvc.perform(get(api + "/documents").param("knowledgeBaseId", "demo"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.total").value(1));
        mvc.perform(get(api + "/documents/" + documentId + "/chunks").param("knowledgeBaseId", "demo"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].chunkIndex").value(1));
        String answer = mvc.perform(post(api + "/questions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"knowledgeBaseId\":\"demo\",\"question\":\"原件保存在哪里？\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.references[0].documentId").value(documentId))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        var reference = json.readTree(answer).path("data").path("references").get(0);
        assertTrue(reference.path("content").asText().contains("MinIO"));
        mvc.perform(get(reference.path("chunkUrl").asText())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value(reference.path("content").asText()));
        mvc.perform(get(reference.path("contentUrl").asText())).andExpect(status().isFound())
                .andExpect(header().string("Location", "https://example.invalid/original?signature=test"));
        mvc.perform(post(api + "/questions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"knowledgeBaseId\":\"empty-base\",\"question\":\"原件保存在哪里？\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.references").isEmpty());
        verify(model, times(1)).call(any(Prompt.class));
    }
}

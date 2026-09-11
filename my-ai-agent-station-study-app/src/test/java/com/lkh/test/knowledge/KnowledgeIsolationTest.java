package com.lkh.test.knowledge;

import com.lkh.domain.knowlege.adapter.port.*;
import com.lkh.domain.knowlege.adapter.repository.IKnowledgeBaseRepository;
import com.lkh.domain.knowlege.adapter.repository.IKnowledgeRepository;
import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.domain.knowlege.model.valobj.KnowledgeException;
import com.lkh.domain.knowlege.service.*;
import com.lkh.trigger.http.*;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 以真实领域服务验证跨库请求和错误召回，不依赖模型自行遵守隔离。 */
public class KnowledgeIsolationTest {

    private static final String DOC_A = "11111111-1111-1111-1111-111111111111";
    private static final String DOC_B = "22222222-2222-2222-2222-222222222222";
    private static final String CHUNK_A = "33333333-3333-3333-3333-333333333333";
    private static final String CHUNK_B = "44444444-4444-4444-4444-444444444444";
    private IKnowledgeRepository repository;
    private IKnowledgeBaseRepository bases;
    private IKnowledgeFilePort files;
    private IKnowledgeParserPort parser;
    private VectorStore vectors;
    private ChatModel model;
    private KnowledgeService service;
    private MockMvc mvc;

    @Before
    public void setup() {
        repository = mock(IKnowledgeRepository.class);
        bases = mock(IKnowledgeBaseRepository.class);
        files = mock(IKnowledgeFilePort.class);
        parser = mock(IKnowledgeParserPort.class);
        vectors = mock(VectorStore.class);
        model = mock(ChatModel.class);
        for (String id : List.of("base-a", "base-b")) {
            when(bases.find(id)).thenReturn(KnowledgeBaseEntity.builder()
                    .knowledgeBaseId(id).name(id).status("ACTIVE").build());
        }
        var baseService = new KnowledgeBaseService(bases);
        service = new KnowledgeService(repository, baseService, files, parser, new TokenTextSplitter(), vectors, model, .5);
        mvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service), new KnowledgeBaseController(baseService))
                .setControllerAdvice(new KnowledgeExceptionHandler()).build();
        source(DOC_A, CHUNK_A, "base-a", "A库专属事实：库存为10。");
        source(DOC_B, CHUNK_B, "base-b", "B库专属事实：库存为99。");
        when(model.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of(new Generation(new AssistantMessage("回答 [1]")))));
    }

    @Test
    public void bothDirectionsExcludeForeignVectorsAndConversationHistory() {
        // 模拟向量层错误地返回所有库的内容；领域层仍必须阻断跨库正文。
        when(vectors.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(
                Document.builder().id(CHUNK_B).text("不可信索引正文").score(.9).build(),
                Document.builder().id(CHUNK_A).text("不可信索引正文").score(.8).build()));
        var answerA = service.ask("base-a", "A的问题", 5);
        var answerB = service.ask("base-b", "B的问题", 5);
        assertEquals(DOC_A, answerA.references().get(0).documentId());
        assertEquals(DOC_B, answerB.references().get(0).documentId());
        assertEquals(1, answerA.references().size());
        assertEquals(1, answerB.references().size());
        assertTrue(answerA.references().get(0).contentUrl().endsWith("knowledgeBaseId=base-a"));
        var prompts = ArgumentCaptor.forClass(Prompt.class);
        verify(model, times(2)).call(prompts.capture());
        String first = prompts.getAllValues().get(0).getContents();
        String second = prompts.getAllValues().get(1).getContents();
        assertTrue(first.contains("A库专属事实")); assertFalse(first.contains("B库专属事实"));
        assertTrue(second.contains("B库专属事实")); assertFalse(second.contains("A库专属事实"));
        assertFalse(second.contains("A的问题")); assertFalse(first.contains("不可信索引正文"));
        var searches = ArgumentCaptor.forClass(SearchRequest.class);
        verify(vectors, times(2)).similaritySearch(searches.capture());
        assertTrue(searches.getAllValues().get(0).getFilterExpression().toString().contains("base-a"));
        assertTrue(searches.getAllValues().get(1).getFilterExpression().toString().contains("base-b"));
    }

    @Test
    public void onlyForeignMatchesNeverReachModel() {
        when(vectors.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(new Document(CHUNK_B, "B库", java.util.Map.of())));
        assertTrue(service.ask("base-a", "问题", 5).references().isEmpty());
        verify(model, never()).call(any(Prompt.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void identicalUploadsStayIndependentAndParserMetadataCannotOverrideScope() {
        when(parser.parse(anyString(), any())).thenReturn(List.of(new Document("相同的学习资料正文。",
                java.util.Map.of("knowledgeBaseId", "forged-base", "documentId", DOC_B))));
        when(files.upload(anyString(), anyString(), any())).thenAnswer(invocation ->
                new IKnowledgeFilePort.StoredFile("test", invocation.getArgument(0) + "/original"));
        var first = service.upload("base-a", "same.txt", new byte[]{1});
        var second = service.upload("base-b", "same.txt", new byte[]{1});
        assertNotEquals(first.getDocumentId(), second.getDocumentId());
        assertNotEquals(first.getObjectKey(), second.getObjectKey());
        assertEquals(first.getSha256(), second.getSha256());
        var batches = ArgumentCaptor.forClass(List.class);
        verify(vectors, times(2)).add(batches.capture());
        var vectorA = (Document) batches.getAllValues().get(0).get(0);
        var vectorB = (Document) batches.getAllValues().get(1).get(0);
        assertNotEquals(vectorA.getId(), vectorB.getId());
        assertEquals("base-a", vectorA.getMetadata().get("knowledgeBaseId"));
        assertEquals("base-b", vectorB.getMetadata().get("knowledgeBaseId"));
        assertEquals(first.getDocumentId(), vectorA.getMetadata().get("documentId"));
        assertEquals(second.getDocumentId(), vectorB.getMetadata().get("documentId"));
    }

    @Test
    public void unknownOrDisabledBasesCannotUploadOrAsk() {
        when(bases.find("disabled")).thenReturn(KnowledgeBaseEntity.builder().knowledgeBaseId("disabled").status("DISABLED").build());
        for (String base : List.of("missing", "disabled")) {
            int expected = base.equals("missing") ? 404 : 409;
            assertEquals(expected, assertThrows(KnowledgeException.class, () -> service.upload(base, "a.txt", new byte[]{1})).getHttpStatus());
            assertEquals(expected, assertThrows(KnowledgeException.class, () -> service.ask(base, "问题", 5)).getHttpStatus());
        }
        verifyNoInteractions(repository, files, parser, vectors, model);
    }

    @Test
    public void scopedDocumentChunkAndOriginalRejectWrongBaseBeforeReadOrSign() throws Exception {
        for (String path : List.of("/documents/" + DOC_B, "/documents/" + DOC_B + "/chunks",
                "/chunks/" + CHUNK_B, "/documents/" + DOC_B + "/content")) {
            mvc.perform(get("/api/v1/knowledge" + path).param("knowledgeBaseId", "base-a"))
                    .andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/knowledge" + path)).andExpect(status().isBadRequest());
        }
        verify(repository, never()).listChunks(anyString(), anyInt(), anyInt());
        verifyNoInteractions(files);
        mvc.perform(get("/api/v1/knowledge/chunks/" + CHUNK_A).param("knowledgeBaseId", "base-a"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content").value("A库专属事实：库存为10。"));
    }

    @Test
    public void documentListUsesExactlyTheSelectedBase() {
        when(repository.listDocuments("base-b", 0, 10)).thenReturn(List.of());
        service.documents("base-b", 1, 10);
        verify(repository).listDocuments("base-b", 0, 10);
        verify(repository).countDocuments("base-b");
        verify(repository, never()).listDocuments(eq("base-a"), anyInt(), anyInt());
    }

    @Test
    public void lifecycleEndpointsCreateRenameDisableAndValidateBodies() throws Exception {
        mvc.perform(post("/api/v1/knowledge/bases").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"中文知识库\",\"description\":\"项目资料\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("中文知识库"))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
        mvc.perform(put("/api/v1/knowledge/bases/base-a").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"改名后\",\"description\":\"说明\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.knowledgeBaseId").value("base-a"));
        mvc.perform(put("/api/v1/knowledge/bases/base-a/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DISABLED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("DISABLED"));
        mvc.perform(post("/api/v1/knowledge/questions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"knowledgeBaseId\":\"base-a\",\"question\":\"问题\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/knowledge/bases").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\" \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/knowledge/bases/missing")).andExpect(status().isNotFound());
    }

    private void source(String documentId, String chunkId, String base, String text) {
        when(repository.findDocument(documentId)).thenReturn(KnowledgeDocumentEntity.builder()
                .documentId(documentId).knowledgeBaseId(base).status("READY").fileName(base + ".txt")
                .bucketName("test").objectKey(documentId).contentUrl("/legacy-link").build());
        when(repository.findChunk(chunkId)).thenReturn(KnowledgeChunkEntity.builder()
                .chunkId(chunkId).documentId(documentId).chunkIndex(1).content(text).build());
    }
}

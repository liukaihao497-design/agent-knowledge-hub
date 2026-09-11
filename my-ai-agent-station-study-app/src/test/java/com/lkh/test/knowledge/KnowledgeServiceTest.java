package com.lkh.test.knowledge;

import com.lkh.domain.knowlege.adapter.port.*;
import com.lkh.domain.knowlege.adapter.repository.IKnowledgeRepository;
import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.domain.knowlege.model.valobj.*;
import com.lkh.domain.knowlege.service.KnowledgeService;
import com.lkh.domain.knowlege.service.IKnowledgeBaseService;
import org.junit.*;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class KnowledgeServiceTest {
    private IKnowledgeRepository repository;
    private IKnowledgeFilePort files;
    private IKnowledgeParserPort parser;
    private VectorStore vectors;
    private ChatModel model;
    private KnowledgeService service;
    private final List<String> states = new ArrayList<>();
    private static final String ID = "12345678-1234-1234-1234-123456789abc";

    @Before
    public void setup() {
        repository = mock(IKnowledgeRepository.class); files = mock(IKnowledgeFilePort.class);
        parser = mock(IKnowledgeParserPort.class); vectors = mock(VectorStore.class); model = mock(ChatModel.class);
        service = new KnowledgeService(repository, mock(IKnowledgeBaseService.class), files, parser, new TokenTextSplitter(30, 1, 1, 100, true), vectors, model, .5);
        states.clear();
        doAnswer(i -> { states.add(i.<KnowledgeDocumentEntity>getArgument(0).getStatus()); return null; }).when(repository).createDocument(any());
        doAnswer(i -> { states.add(i.<KnowledgeDocumentEntity>getArgument(0).getStatus()); return null; }).when(repository).updateDocument(any());
        when(files.upload(anyString(), anyString(), any())).thenReturn(new IKnowledgeFilePort.StoredFile("kb", "knowledge/object"));
        when(parser.parse(anyString(), any())).thenReturn(List.of(new Document("Knowledge documents provide reliable reference material. ".repeat(60))));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void uploadPersistsSameChunkIdsAndOnlyBecomesReadyAfterIndexing() {
        KnowledgeDocumentEntity document = service.upload("demo", "../notes.txt", "source".getBytes(StandardCharsets.UTF_8));
        assertEquals(List.of("UPLOADING", "UPLOADED", "INDEXING", "READY"), states);
        assertEquals("notes.txt", document.getFileName()); assertEquals(64, document.getSha256().length());
        ArgumentCaptor<List<KnowledgeChunkEntity>> chunks = ArgumentCaptor.forClass(List.class);
        verify(repository).saveChunks(eq(document), chunks.capture());
        ArgumentCaptor<List<Document>> indexed = ArgumentCaptor.forClass(List.class);
        verify(vectors, atLeastOnce()).add(indexed.capture());
        List<Document> allVectors = indexed.getAllValues().stream().flatMap(Collection::stream).toList();
        assertTrue(chunks.getValue().size() > 1); assertEquals(document.getChunkCount(), allVectors.size());
        for (int i = 0; i < allVectors.size(); i++) {
            assertEquals(chunks.getValue().get(i).getChunkId(), allVectors.get(i).getId());
            assertEquals(chunks.getValue().get(i).getContent(), allVectors.get(i).getText());
            assertEquals("demo", allVectors.get(i).getMetadata().get("knowledgeBaseId"));
            assertEquals(KnowledgeService.NAMESPACE, allVectors.get(i).getMetadata().get("namespace"));
        }
        assertTrue(document.getContentUrl().endsWith(document.getDocumentId() + "/content?knowledgeBaseId=demo"));
        var order = inOrder(repository, vectors);
        order.verify(repository).saveChunks(any(), anyList());
        order.verify(vectors, atLeastOnce()).add(anyList());
        order.verify(repository).updateDocument(any());
    }

    @Test
    public void partialVectorFailureMarksFailedAndAttemptsCompensation() {
        doThrow(new IllegalStateException("secret-provider-detail")).when(vectors).add(anyList());
        KnowledgeException error = assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.txt", new byte[]{1}));
        assertEquals(502, error.getHttpStatus()); assertNotNull(error.getDocumentId());
        assertFalse(error.getMessage().contains("secret-provider-detail"));
        assertEquals("FAILED", states.get(states.size() - 1)); verify(vectors).delete(anyList());
    }

    @Test
    public void compensationFailureStillPersistsFailed() {
        doThrow(new IllegalStateException()).when(vectors).add(anyList());
        doThrow(new IllegalStateException()).when(vectors).delete(anyList());
        KnowledgeException error = assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.txt", new byte[]{1}));
        assertEquals("FAILED", states.get(states.size() - 1)); assertEquals(1, error.getCause().getSuppressed().length);
    }

    @Test
    public void minioFailureNeverParsesOrIndexes() {
        when(files.upload(anyString(), anyString(), any())).thenThrow(new IllegalStateException());
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.txt", new byte[]{1}));
        assertEquals(List.of("UPLOADING", "FAILED"), states); verifyNoInteractions(parser, vectors);
    }

    @Test
    public void emptyParsedDocumentRetainsSourceAndCannotBecomeReady() {
        when(parser.parse(anyString(), any())).thenReturn(List.of(new Document("   ")));
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "scan.pdf", new byte[]{1}));
        assertEquals("FAILED", states.get(states.size() - 1)); verifyNoInteractions(vectors);
    }

    @Test
    public void chunkPersistenceFailureDoesNotCallEmbedding() {
        doThrow(new IllegalStateException()).when(repository).saveChunks(any(), anyList());
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.txt", new byte[]{1}));
        assertEquals("FAILED", states.get(states.size() - 1)); verifyNoInteractions(vectors);
    }

    @Test
    public void invalidInputsDoNotWriteAnything() {
        assertThrows(KnowledgeException.class, () -> service.upload("demo' || true", "a.txt", new byte[]{1}));
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.exe", new byte[]{1}));
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.txt", new byte[0]));
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "a.txt", new byte[KnowledgeService.MAX_FILE_BYTES + 1]));
        assertThrows(KnowledgeException.class, () -> service.upload("demo", "a\n.txt", new byte[]{1}));
        verifyNoInteractions(repository, files, vectors);
    }

    @Test
    public void noReferencesDoesNotCallModelAndSearchIsScoped() {
        when(vectors.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());
        KnowledgeAnswer result = service.ask("demo", "找不到的内容", null);
        assertTrue(result.references().isEmpty()); assertTrue(result.answer().contains("未找到"));
        verify(model, never()).call(any(Prompt.class));
        ArgumentCaptor<SearchRequest> request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(vectors).similaritySearch(request.capture());
        String filter = request.getValue().getFilterExpression().toString();
        assertTrue(filter.contains("namespace")); assertTrue(filter.contains("knowledge-v1"));
        assertTrue(filter.contains("knowledgeBaseId")); assertTrue(filter.contains("demo"));
    }

    @Test
    public void answerRejectsOtherBaseFailedAndOrphanVectorsUsesDatabaseText() {
        Document good = match("good"); Document wrongBase = match("other"); Document failed = match("failed");
        when(vectors.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(wrongBase, failed, match("orphan"), good, good));
        source("good", "doc-good", "demo", "READY", "可信正文 {literal}");
        source("other", "doc-other", "other-base", "READY", "跨库秘密");
        source("failed", "doc-failed", "demo", "FAILED", "失败文档");
        when(model.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of(new Generation(new AssistantMessage("依据资料 [1]。")))));
        KnowledgeAnswer result = service.ask("demo", "问题 {not_a_template}", 5);
        assertEquals(1, result.references().size()); assertEquals("good", result.references().get(0).chunkId());
        assertEquals("可信正文 {literal}", result.references().get(0).content());
        ArgumentCaptor<Prompt> prompt = ArgumentCaptor.forClass(Prompt.class); verify(model).call(prompt.capture());
        String sent = prompt.getValue().getContents();
        assertTrue(sent.contains("可信正文 {literal}")); assertTrue(sent.contains("{not_a_template}"));
        assertFalse(sent.contains("跨库秘密")); assertFalse(sent.contains("失败文档")); assertFalse(sent.contains("索引旧文本"));
    }

    @Test
    public void invalidQuestionsAndPaginationAreRejected() {
        assertThrows(KnowledgeException.class, () -> service.ask("demo", " ", 5));
        assertThrows(KnowledgeException.class, () -> service.ask("demo", "q".repeat(4001), 5));
        assertThrows(KnowledgeException.class, () -> service.ask("demo", "question", 0));
        assertThrows(KnowledgeException.class, () -> service.ask("demo", "question", 11));
        assertThrows(KnowledgeException.class, () -> service.documents("demo", 0, 20));
        assertThrows(KnowledgeException.class, () -> service.documents("demo", 1, 101));
        assertThrows(KnowledgeException.class, () -> service.document("demo", "not-uuid"));
        verifyNoInteractions(repository, vectors);
    }

    @Test
    public void contentLinkRequiresUploadedObjectAndIsRegenerated() {
        KnowledgeDocumentEntity doc = KnowledgeDocumentEntity.builder().documentId(ID).knowledgeBaseId("demo").fileName("资料.pdf").build();
        when(repository.findDocument(ID)).thenReturn(doc);
        assertEquals(409, assertThrows(KnowledgeException.class, () -> service.contentUrl("demo", ID)).getHttpStatus());
        doc.setBucketName("bucket"); doc.setObjectKey("key");
        when(files.downloadUrl("bucket", "key", "资料.pdf")).thenReturn("https://example.invalid/signed");
        assertEquals("https://example.invalid/signed", service.contentUrl("demo", ID));
        assertEquals(404, assertThrows(KnowledgeException.class, () -> service.chunk("demo", ID)).getHttpStatus());
    }

    private Document match(String id) { return Document.builder().id(id).text("索引旧文本").score(.8).build(); }
    private void source(String chunk, String doc, String base, String status, String content) {
        when(repository.findChunk(chunk)).thenReturn(KnowledgeChunkEntity.builder().chunkId(chunk).documentId(doc)
                .chunkIndex(1).content(content).build());
        when(repository.findDocument(doc)).thenReturn(KnowledgeDocumentEntity.builder().documentId(doc)
                .knowledgeBaseId(base).status(status).fileName("资料.txt").contentUrl("/source/" + doc).build());
    }
}

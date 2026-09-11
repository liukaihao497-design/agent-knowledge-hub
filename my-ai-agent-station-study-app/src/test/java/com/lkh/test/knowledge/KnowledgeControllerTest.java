package com.lkh.test.knowledge;

import com.lkh.domain.knowlege.model.entity.KnowledgeDocumentEntity;
import com.lkh.domain.knowlege.model.valobj.*;
import com.lkh.domain.knowlege.service.IKnowledgeService;
import com.lkh.trigger.http.*;
import org.junit.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

public class KnowledgeControllerTest {
    private IKnowledgeService service;
    private MockMvc mvc;
    private static final String API = "/api/v1/knowledge";
    @Before public void setup() {
        service = mock(IKnowledgeService.class);
        mvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service))
                .setControllerAdvice(new KnowledgeExceptionHandler()).build();
    }
    @Test public void multipartUploadReturnsDocumentAndStableLink() throws Exception {
        when(service.upload(eq("demo"), eq("a.txt"), any())).thenReturn(KnowledgeDocumentEntity.builder()
                .documentId("document").status("READY").chunkCount(2).contentUrl("/source").build());
        mvc.perform(multipart(API + "/documents").file(new MockMultipartFile("file", "a.txt", "text/plain", "正文".getBytes()))
                .param("knowledgeBaseId", "demo")).andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("0000")).andExpect(jsonPath("$.data.chunkCount").value(2));
    }
    @Test public void uploadFailureContainsDocumentIdWithoutProviderDetails() throws Exception {
        when(service.upload(any(), any(), any())).thenThrow(new KnowledgeException(502, "向量索引失败", "doc-123", new RuntimeException("api-secret")));
        mvc.perform(multipart(API + "/documents").file(new MockMultipartFile("file", "a.txt", "text/plain", new byte[]{1}))
                .param("knowledgeBaseId", "demo")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.data.documentId").value("doc-123"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("api-secret"))));
    }
    @Test public void malformedAndMissingParametersUse400() throws Exception {
        mvc.perform(post(API + "/questions").contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("K400"));
        mvc.perform(get(API + "/documents")).andExpect(status().isBadRequest());
        mvc.perform(get(API + "/documents").param("knowledgeBaseId", "demo").param("page", "abc"))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart(API + "/documents").param("knowledgeBaseId", "demo"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test public void emptyUploadRejectedBeforeDomainCall() throws Exception {
        mvc.perform(multipart(API + "/documents").file(new MockMultipartFile("file", "a.txt", "text/plain", new byte[0]))
                .param("knowledgeBaseId", "demo")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test public void questionResponseContainsActualReference() throws Exception {
        when(service.ask("demo", "问题", 3)).thenReturn(new KnowledgeAnswer("回答 [1]", List.of(
                new KnowledgeAnswer.Reference(1, "doc", "chunk", 2, "资料.txt", "依据", .8, "/chunk", "/original"))));
        mvc.perform(post(API + "/questions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"knowledgeBaseId\":\"demo\",\"question\":\"问题\",\"topK\":3}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.references[0].chunkIndex").value(2));
    }
    @Test public void sourceRedirectIsNotCached() throws Exception {
        when(service.contentUrl("demo", "doc")).thenReturn("https://example.invalid/signed");
        mvc.perform(get(API + "/documents/doc/content").param("knowledgeBaseId", "demo")).andExpect(status().isFound())
                .andExpect(header().string("Location", "https://example.invalid/signed"))
                .andExpect(header().string("Cache-Control", "no-store"));
    }
    @Test public void missingAndUnexpectedFailureAreSafe() throws Exception {
        when(service.document("demo", "missing")).thenThrow(new KnowledgeException(404, "文档不存在"));
        mvc.perform(get(API + "/documents/missing").param("knowledgeBaseId", "demo")).andExpect(status().isNotFound());
        when(service.document("demo", "error")).thenThrow(new IllegalStateException("password-sensitive"));
        mvc.perform(get(API + "/documents/error").param("knowledgeBaseId", "demo")).andExpect(status().isInternalServerError())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("password-sensitive"))));
    }
}

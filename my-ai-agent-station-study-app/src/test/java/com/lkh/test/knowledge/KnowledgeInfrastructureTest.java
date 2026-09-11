package com.lkh.test.knowledge;

import com.lkh.config.KnowledgeConfiguration;
import com.lkh.domain.knowlege.model.entity.*;
import com.lkh.domain.knowlege.service.IKnowledgeService;
import com.lkh.infrastructure.adapter.port.*;
import com.lkh.infrastructure.adapter.repository.KnowledgeRepository;
import com.lkh.infrastructure.dao.*;
import com.lkh.infrastructure.dao.po.*;
import com.lkh.trigger.http.*;
import io.minio.*;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class KnowledgeInfrastructureTest {
    @Test public void bothMappersLoadAndBindBatchAndPagingParameters() throws Exception {
        Configuration config = new Configuration();
        for (String resource : List.of("mybatis/mapper/knowledge_document_mapper.xml", "mybatis/mapper/knowledge_chunk_mapper.xml", "mybatis/mapper/knowledge_base_mapper.xml")) {
            try (var stream = getClass().getClassLoader().getResourceAsStream(resource)) {
                assertNotNull(stream); new XMLMapperBuilder(stream, config, resource, config.getSqlFragments()).parse();
            }
        }
        var sql = config.getMappedStatement(IKnowledgeChunkDao.class.getName() + ".insertBatch")
                .getBoundSql(Map.of("chunks", List.of(new KnowledgeChunk(), new KnowledgeChunk())));
        assertEquals(18, sql.getParameterMappings().size());
        assertTrue(sql.getSql().contains("INSERT INTO knowledge_chunk"));
        var list = config.getMappedStatement(IKnowledgeDocumentDao.class.getName() + ".list")
                .getBoundSql(Map.of("knowledgeBaseId", "demo", "offset", 0, "limit", 10));
        assertEquals(3, list.getParameterMappings().size());
        assertEquals("knowledgeBaseId", list.getParameterMappings().get(0).getProperty());
        var baseList = config.getMappedStatement(IKnowledgeBaseDao.class.getName() + ".list")
                .getBoundSql(Map.of("status", "ACTIVE", "offset", 10, "limit", 10));
        assertEquals(3, baseList.getParameterMappings().size());
        assertTrue(baseList.getSql().contains("status=?"));
        var update = config.getMappedStatement(IKnowledgeBaseDao.class.getName() + ".updateInformation")
                .getBoundSql(new KnowledgeBase());
        assertTrue(update.getSql().contains("WHERE knowledge_base_id=?"));
        assertFalse(update.getSql().contains("status="));
        assertFalse(update.getSql().contains("SET knowledge_base_id"));
    }

    @Test public void chunkFailureRollsBackMysqlTransaction() {
        var docs = mock(IKnowledgeDocumentDao.class); var chunks = mock(IKnowledgeChunkDao.class);
        var manager = mock(PlatformTransactionManager.class); var status = mock(TransactionStatus.class);
        when(manager.getTransaction(any())).thenReturn(status);
        when(chunks.insertBatch(anyList())).thenThrow(new IllegalStateException("database failure"));
        var repository = new KnowledgeRepository(docs, chunks, new TransactionTemplate(manager));
        assertThrows(IllegalStateException.class, () -> repository.saveChunks(new KnowledgeDocumentEntity(), List.of(new KnowledgeChunkEntity())));
        verify(manager).rollback(status); verify(manager, never()).commit(any()); verify(docs, never()).update(any());
    }

    @Test public void repositoryCommitsChunksAndCountTogether() {
        var docs = mock(IKnowledgeDocumentDao.class); var chunks = mock(IKnowledgeChunkDao.class);
        var manager = mock(PlatformTransactionManager.class); var status = mock(TransactionStatus.class);
        when(manager.getTransaction(any())).thenReturn(status); when(chunks.insertBatch(anyList())).thenReturn(1); when(docs.update(any())).thenReturn(1);
        var repository = new KnowledgeRepository(docs, chunks, new TransactionTemplate(manager));
        repository.saveChunks(KnowledgeDocumentEntity.builder().chunkCount(1).build(), List.of(new KnowledgeChunkEntity()));
        verify(manager).commit(status); verify(manager, never()).rollback(any());
        verify(docs).update(argThat(d -> d.getChunkCount() == 1));
    }

    @Test public void realTikaAndSplitterPreserveChineseTextAndMetadata() {
        var parsed = new KnowledgeTikaParserPort().parse("资料.txt", "知识库原文件存储到 MinIO，切片正文存储到 MySQL。\n".repeat(80).getBytes(StandardCharsets.UTF_8));
        var chunks = new TokenTextSplitter(50, 1, 1, 1000, true).apply(parsed);
        assertTrue(chunks.size() > 1);
        String text = chunks.stream().map(org.springframework.ai.document.Document::getText).reduce("", String::concat);
        assertTrue(text.contains("知识库")); assertTrue(text.contains("MinIO"));
    }

    @Test public void minioKeyCannotContainUploadedFileNameAndDownloadIsSigned() throws Exception {
        MinioClient client = mock(MinioClient.class);
        var port = new KnowledgeMinioFilePort(client, "knowledge");
        var result = port.upload("doc-id", "text/plain", new byte[]{1});
        assertEquals("knowledge/doc-id/original", result.objectKey());
        verify(client).putObject(argThat(args -> args.bucket().equals("knowledge") && args.object().equals(result.objectKey())));
        when(client.getPresignedObjectUrl(any())).thenReturn("https://example.invalid/signed");
        assertEquals("https://example.invalid/signed", port.downloadUrl("knowledge", result.objectKey(), "文档 名称.txt"));
        verify(client).getPresignedObjectUrl(argThat(args -> args.expiry() == 600 && args.object().equals(result.objectKey())));
    }

    @Test public void disabledFeatureCreatesNoServiceOrController() {
        new ApplicationContextRunner().withUserConfiguration(KnowledgeConfiguration.class, KnowledgeController.class, KnowledgeBaseController.class, KnowledgeExceptionHandler.class)
                .run(context -> { assertNull(context.getStartupFailure()); assertFalse(context.containsBean("knowledgeService")); assertFalse(context.containsBean("knowledgeController")); });
    }

    @Test public void enabledFeatureWiresWithoutExternalCalls() {
        new ApplicationContextRunner().withUserConfiguration(KnowledgeConfiguration.class, KnowledgeController.class, KnowledgeBaseController.class, KnowledgeExceptionHandler.class)
                .withBean(IKnowledgeBaseDao.class, () -> mock(IKnowledgeBaseDao.class))
                .withBean(IKnowledgeDocumentDao.class, () -> mock(IKnowledgeDocumentDao.class))
                .withBean(IKnowledgeChunkDao.class, () -> mock(IKnowledgeChunkDao.class))
                .withBean("mysqlDataSource", DataSource.class, () -> mock(DataSource.class))
                .withBean("vectorStore", VectorStore.class, () -> mock(VectorStore.class))
                .withBean("pgVectorJdbcTemplate", JdbcTemplate.class, () -> mock(JdbcTemplate.class))
                .withBean("openAiEmbeddingModel", EmbeddingModel.class, () -> mock(EmbeddingModel.class))
                .withBean("openAiChatModel", ChatModel.class, () -> mock(ChatModel.class))
                .withBean(TokenTextSplitter.class, TokenTextSplitter::new)
                .withPropertyValues("knowledge.enabled=true", "knowledge.minio.endpoint=http://localhost:19000",
                        "knowledge.minio.access-key=test-access", "knowledge.minio.secret-key=test-secret", "knowledge.minio.bucket=knowledge")
                .run(context -> {
                    assertNull(context.getStartupFailure()); assertNotNull(context.getBean(IKnowledgeService.class));
                    assertNotNull(context.getBean(KnowledgeController.class));
                    assertEquals(1, context.getBeansOfType(VectorStore.class).size());
                    verifyNoInteractions(context.getBean("vectorStore", VectorStore.class));
                });
    }
}

package com.lkh.config;

import com.lkh.domain.knowlege.adapter.port.*;
import com.lkh.domain.knowlege.adapter.repository.IKnowledgeRepository;
import com.lkh.domain.knowlege.adapter.repository.IKnowledgeBaseRepository;
import com.lkh.domain.knowlege.service.*;
import com.lkh.infrastructure.adapter.port.*;
import com.lkh.infrastructure.adapter.repository.KnowledgeRepository;
import com.lkh.infrastructure.adapter.repository.KnowledgeBaseRepository;
import com.lkh.infrastructure.dao.*;
import io.minio.MinioClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.pgvector.PgVectorStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;

/** 仅显式开启知识库时创建组件，不改既有 agent 配置。 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "knowledge.enabled", havingValue = "true")
public class KnowledgeConfiguration {
    @Bean
    public IKnowledgeBaseRepository knowledgeBaseRepository(IKnowledgeBaseDao knowledgeBaseDao) {
        return new KnowledgeBaseRepository(knowledgeBaseDao);
    }

    @Bean
    public IKnowledgeBaseService knowledgeBaseService(IKnowledgeBaseRepository repository) {
        return new KnowledgeBaseService(repository);
    }

    @Bean
    public IKnowledgeRepository knowledgeRepository(IKnowledgeDocumentDao documentDao, IKnowledgeChunkDao chunkDao,
                                                    @Qualifier("mysqlDataSource") DataSource dataSource) {
        return new KnowledgeRepository(documentDao, chunkDao,
                new TransactionTemplate(new DataSourceTransactionManager(dataSource)));
    }
    @Bean
    public IKnowledgeFilePort knowledgeFilePort(@Value("${knowledge.minio.endpoint}") String endpoint,
                                               @Value("${knowledge.minio.access-key}") String accessKey,
                                               @Value("${knowledge.minio.secret-key}") String secretKey,
                                               @Value("${knowledge.minio.bucket}") String bucket) {
        MinioClient client = MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey).build();
        client.setTimeout(10_000, 60_000, 60_000);
        return new KnowledgeMinioFilePort(client, bucket);
    }
    @Bean
    public IKnowledgeParserPort knowledgeParserPort() { return new KnowledgeTikaParserPort(); }
    @Bean
    public IKnowledgeService knowledgeService(IKnowledgeRepository repository, IKnowledgeBaseService knowledgeBaseService,
                                             IKnowledgeFilePort filePort,
                                             IKnowledgeParserPort parser, TokenTextSplitter splitter,
                                             @Qualifier("pgVectorJdbcTemplate") JdbcTemplate jdbcTemplate,
                                             @Qualifier("openAiEmbeddingModel") EmbeddingModel embeddingModel,
                                             @Qualifier("openAiChatModel") ChatModel chatModel,
                                             @Value("${knowledge.vector-dimensions:1536}") int dimensions,
                                             @Value("${knowledge.similarity-threshold:0.5}") double threshold) {
        if (dimensions < 1 || dimensions > 2000) throw new IllegalArgumentException("knowledge.vector-dimensions 限 1–2000");
        // 使用独立表且不注册第二个 VectorStore Bean，避免影响旧代码按类型注入。
        // 表由新增 SQL 手工创建，不在启动时修改数据库结构。
        PgVectorStore vectorStore = PgVectorStore.builder(jdbcTemplate, embeddingModel)
                .vectorTableName("knowledge_vector_store").dimensions(dimensions)
                .distanceType(PgVectorStore.PgDistanceType.COSINE_DISTANCE).initializeSchema(false).build();
        return new KnowledgeService(repository, knowledgeBaseService, filePort, parser, splitter, vectorStore, chatModel, threshold);
    }
}

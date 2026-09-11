package com.lkh.infrastructure.adapter.port;

import com.lkh.domain.knowlege.adapter.port.IKnowledgeFilePort;
import io.minio.*;
import io.minio.http.Method;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** 桶由运维预先创建为私有桶；不更改既有桶策略。 */
public class KnowledgeMinioFilePort implements IKnowledgeFilePort {
    private final MinioClient client;
    private final String bucket;
    public KnowledgeMinioFilePort(MinioClient client, String bucket) {
        this.client = client;
        this.bucket = bucket;
    }
    @Override
    public StoredFile upload(String documentId, String contentType, byte[] content) {
        String key = "knowledge/" + documentId + "/original";
        try (ByteArrayInputStream stream = new ByteArrayInputStream(content)) {
            client.putObject(PutObjectArgs.builder().bucket(bucket).object(key)
                    .contentType(contentType).stream(stream, content.length, -1).build());
            return new StoredFile(bucket, key);
        } catch (Exception e) { throw new IllegalStateException("MinIO 原件上传失败", e); }
    }
    @Override
    public String downloadUrl(String bucket, String objectKey, String fileName) {
        try {
            String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
            return client.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET).bucket(bucket).object(objectKey).expiry(10, TimeUnit.MINUTES)
                    .extraQueryParams(Map.of("response-content-disposition", "attachment; filename*=UTF-8''" + encoded))
                    .build());
        } catch (Exception e) { throw new IllegalStateException("MinIO 签名失败", e); }
    }
}

package com.lkh.domain.knowlege.adapter.port;

public interface IKnowledgeFilePort {
    StoredFile upload(String documentId, String contentType, byte[] content);
    String downloadUrl(String bucket, String objectKey, String fileName);
    record StoredFile(String bucket, String objectKey) {}
}

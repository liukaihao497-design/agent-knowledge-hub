package com.lkh.domain.knowlege.model.valobj;

/** 面向接口的安全错误信息，底层异常仅作为 cause 保留。 */
public class KnowledgeException extends RuntimeException {
    private final int httpStatus;
    private final String documentId;
    public KnowledgeException(int status, String message) { this(status, message, null, null); }
    public KnowledgeException(int status, String message, String documentId, Throwable cause) {
        super(message, cause);
        this.httpStatus = status;
        this.documentId = documentId;
    }
    public int getHttpStatus() { return httpStatus; }
    public String getDocumentId() { return documentId; }
}

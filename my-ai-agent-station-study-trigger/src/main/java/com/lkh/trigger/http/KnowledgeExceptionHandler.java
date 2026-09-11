package com.lkh.trigger.http;

import com.lkh.api.dto.KnowledgeResponseDTO.Failure;
import com.lkh.api.response.Response;
import com.lkh.domain.knowlege.model.valobj.KnowledgeException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/** 仅处理知识库控制器，不改变 agent 接口错误行为。 */
@Slf4j
@RestControllerAdvice(assignableTypes = {KnowledgeController.class, KnowledgeBaseController.class})
@ConditionalOnProperty(name = "knowledge.enabled", havingValue = "true")
public class KnowledgeExceptionHandler {
    @ExceptionHandler(KnowledgeException.class)
    public ResponseEntity<Response<Failure>> knowledge(KnowledgeException e) {
        if (e.getHttpStatus() >= 500) {
            log.warn("知识库操作失败 documentId={}, stage={}, causeType={}", e.getDocumentId(), e.getMessage(),
                    e.getCause() == null ? "unknown" : e.getCause().getClass().getSimpleName());
        }
        return error(e.getHttpStatus(), e.getMessage(), e.getDocumentId());
    }
    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class, MissingServletRequestPartException.class})
    public ResponseEntity<Response<Failure>> invalid(Exception e) {
        return error(400, "请求格式错误或缺少必要参数", null);
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Response<Failure>> tooLarge(Exception e) {
        return error(413, "文件超过服务器上传大小限制", null);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Response<Failure>> unexpected(Exception e) {
        log.error("知识库请求失败 causeType={}", e.getClass().getSimpleName());
        return error(500, "知识库服务暂时不可用，请检查服务配置", null);
    }
    private ResponseEntity<Response<Failure>> error(int status, String message, String id) {
        return ResponseEntity.status(status).body(Response.<Failure>builder().code("K" + status)
                .info(message).data(new Failure(id)).build());
    }
}
